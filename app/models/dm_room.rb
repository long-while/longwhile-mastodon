# frozen_string_literal: true

# == Schema Information
#
# Table name: dm_rooms
#
#  id              :bigint(8)        not null, primary key
#  member_count    :integer          default(0), not null
#  participant_key :string           not null
#  title           :string
#  created_at      :datetime         not null
#  updated_at      :datetime         not null
#  creator_id      :bigint(8)
#  last_status_id  :bigint(8)
#  root_status_id  :bigint(8)
#

class DmRoom < ApplicationRecord
  include Redisable

  has_many :dm_room_members, dependent: :destroy
  has_many :dm_room_reads, dependent: :destroy
  has_many :dm_room_nicknames, dependent: :destroy
  has_many :members, through: :dm_room_members, source: :account
  has_many :conversations, dependent: nil, inverse_of: :dm_room

  belongs_to :root_status, class_name: 'Status', optional: true
  belongs_to :last_status, class_name: 'Status', optional: true

  belongs_to :creator, class_name: 'Account', optional: true

  validates :participant_key, presence: true

  STATUS_SCAN_LIMIT = 200

  TITLE_MAX_LENGTH = 100

  TITLE_EVENT_PREFIX = 'conversation:title_changed:'

  MEMBER_EVENT_PREFIX = 'conversation:members_changed:'

  EVENT_LOCALE = :ko

  def self.reserved_event_marker?(spoiler_text)
    spoiler_text.to_s.start_with?(TITLE_EVENT_PREFIX, MEMBER_EVENT_PREFIX)
  end

  MAX_MEMBERS = 20

  class DuplicateRoomError < StandardError
    attr_reader :room

    def initialize(room)
      @room = room
      super('a room with this participant set already exists')
    end
  end

  scope :visible_to, lambda { |account|
    joins(:dm_room_members).merge(DmRoomMember.visible.where(account_id: account.id))
  }

  def group?
    member_count > 2
  end

  def to_log_human_identifier
    members.map { |account| "@#{account.acct}" }.sort.join(', ')
  end

  def created_by?(account)
    creator_id.present? && creator_id == account.id
  end

  class << self
    def to_a_paginated_by_last_status_id(limit, options = {})
      if options[:min_id].present?
        paginate_rooms_by_min_id(limit, options[:min_id], options[:max_id]).reverse
      else
        paginate_rooms_by_max_id(limit, options[:max_id], options[:since_id]).to_a
      end
    end

    def paginate_rooms_by_max_id(limit, max_id = nil, since_id = nil)
      query = where.not(last_status_id: nil).order(last_status_id: :desc).limit(limit)
      query = query.where(arel_table[:last_status_id].lt(max_id)) if max_id.present?
      query = query.where(arel_table[:last_status_id].gt(since_id)) if since_id.present?
      query
    end

    def paginate_rooms_by_min_id(limit, min_id = nil, max_id = nil)
      query = where.not(last_status_id: nil).reorder(last_status_id: :asc).limit(limit)
      query = query.where(arel_table[:last_status_id].gt(min_id)) if min_id.present?
      query = query.where(arel_table[:last_status_id].lt(max_id)) if max_id.present?
      query
    end

    def participant_key_for(account_ids)
      normalized = normalize_ids(account_ids)
      raise ArgumentError, 'dm room needs at least one participant' if normalized.empty?

      Digest::SHA256.hexdigest(normalized.join(','))
    end

    def normalize_ids(account_ids)
      Array(account_ids).compact.map(&:to_i).uniq.sort
    end

    def find_or_create_for(account_ids, creator: nil)
      ids = normalize_ids(account_ids)
      key = participant_key_for(ids)

      existing = find_by(participant_key: key)
      return existing if existing

      begin
        transaction(requires_new: true) do
          room = create!(participant_key: key, member_count: ids.size, creator_id: creator&.id)
          ids.each { |account_id| room.dm_room_members.create!(account_id: account_id) }
          room
        end
      rescue ActiveRecord::RecordNotUnique
        find_by!(participant_key: key)
      end
    end

    def attach_status!(status, resurrect: true)
      return unless status.direct_visibility?
      return if status.conversation_id.blank?

      participant_ids = participants_for(status)
      return if participant_ids.size < 2
      return if history_of_another_room?(status, participant_ids)

      owner = Conversation.find_by(id: status.conversation_id)&.dm_room
      room  = owner&.accepts_participants?(participant_ids) ? owner : find_or_create_for(participant_ids, creator: status.account)
      room.attach_conversation!(status.conversation_id)
      room.adopt_stray_status!(status) unless room.conversation_attached?(status.conversation_id)
      room.register_status!(status, resurrect: resurrect)
      room
    end

    def participants_for(status)
      normalize_ids(status.active_mentions.pluck(:account_id) + [status.account_id])
    end

    def history_of_another_room?(status, participant_ids)
      owner = Conversation.find_by(id: status.conversation_id)&.dm_room

      return false if owner.nil? || owner.accepts_participants?(participant_ids)

      boundary = owner.last_member_event_id

      boundary.present? && status.id < boundary
    end

    def thread_accepts?(thread, participant_ids)
      thread = thread.reblog if thread.reblog?

      return true if participant_ids.size < 2 || thread.conversation_id.blank?

      room = Conversation.find_by(id: thread.conversation_id)&.dm_room

      return room.accepts_participants?(participant_ids) if room

      !thread.direct_visibility? || participants_for(thread) == participant_ids
    end
  end

  def attach_conversation!(conversation_id)
    Conversation.where(id: conversation_id, dm_room_id: nil).update_all(dm_room_id: id)
  end

  def conversation_attached?(conversation_id)
    conversation_id.present? && Conversation.exists?(id: conversation_id, dm_room_id: id)
  end

  def adopt_stray_status!(status)
    status.with_lock do
      next if conversation_attached?(status.conversation_id)

      Rails.logger.warn { "DmRoom #{id}: status #{status.id} arrived in conversation #{status.conversation_id} of another room; moving it" }

      MoveDmStatusesService.new.call([status], self)
    end
  end

  def last_member_event_id
    Status.direct_visibility
      .where(conversation_id: conversations.select(:id))
      .where('statuses.spoiler_text LIKE ?', "#{self.class.sanitize_sql_like(MEMBER_EVENT_PREFIX)}%")
      .reorder(nil)
      .maximum(:id)
  end

  def thread_intact?
    last_status.present? && root_status.present? &&
      conversation_attached?(last_status.conversation_id) &&
      conversation_attached?(root_status.conversation_id)
  end

  def heal_thread!
    rewind_last_status! unless thread_intact?
  end

  def register_status!(status, resurrect: true)
    mark_read_for_author!(status) if resurrect

    advanced = self.class
      .where(id: id)
      .where('last_status_id IS NULL OR last_status_id < ?', status.id)
      .update_all(last_status_id: status.id, updated_at: Time.now.utc)

    return if advanced.zero?

    reload
    refresh_root_status!

    unhide_for_everyone! if resurrect
  end

  def refresh_root_status!
    conversation_id = last_status&.conversation_id
    conversation_id = nil unless conversation_attached?(conversation_id)
    new_root_id     = conversation_id && oldest_room_status_id(conversation_id)

    return if new_root_id == root_status_id

    update_column(:root_status_id, new_root_id)
  end

  def rewind_last_status!
    latest = latest_room_status_id

    if latest.nil? && last_status_id.present?
      refresh_root_status!
      return
    end

    if latest != last_status_id
      update_columns(last_status_id: latest, updated_at: Time.now.utc)
      reload
    end

    refresh_root_status!
  end

  def unhide_for_everyone!
    dm_room_members.where.not(hidden_at: nil).update_all(hidden_at: nil, updated_at: Time.now.utc)
  end

  def room_statuses(conversation_id = nil)
    member_ids = dm_room_members.pluck(:account_id)

    scope = Status.direct_visibility
    scope = conversation_id ? scope.where(conversation_id: conversation_id) : scope.where(conversation_id: conversations.select(:id))

    scope.where(account_id: member_ids)
      .where.not(id: Mention.active.where.not(account_id: member_ids).select(:status_id))
      .includes(:active_mentions)
  end

  def latest_room_status_id
    member_ids = dm_room_members.pluck(:account_id).sort

    room_statuses.reorder(id: :desc).limit(STATUS_SCAN_LIMIT)
      .find { |status| self.class.participants_for(status) == member_ids }&.id
  end

  def oldest_room_status_id(conversation_id)
    member_ids = dm_room_members.pluck(:account_id).sort

    room_statuses(conversation_id).reorder(id: :asc).limit(STATUS_SCAN_LIMIT)
      .find { |status| self.class.participants_for(status) == member_ids }&.id
  end

  def visible_statuses_for(account)
    scope = Status.where(conversation_id: conversations.select(:id)).direct_visibility

    visible = scope.where(account_id: account.id).or(
      scope.where(id: Mention.active.where(account_id: account.id).select(:status_id))
    )

    visible.where.not(id: DmHiddenStatus.status_ids_for(account))
      .where.not(account_id: account.excluded_from_timeline_account_ids)
  end

  def other_accounts(account)
    members.reject { |member| member.id == account.id }
  end

  def unread_count_for(account)
    self.class.unread_counts_for([self], account).fetch(id, 0)
  end

  UNREAD_CURSOR_JOIN = <<~SQL.squish # rubocop:disable I18n/RailsI18n/DecorateString
    LEFT OUTER JOIN dm_room_reads
      ON dm_room_reads.dm_room_id = conversations.dm_room_id
     AND dm_room_reads.account_id = ?
  SQL

  class << self
    def unread_counts_for(rooms, account)
      rooms = Array(rooms)
      return {} if rooms.empty?

      counted_ids = rooms.map(&:id) - legacy_read_room_ids(rooms_without_cursor(rooms, account), account)
      return {} if counted_ids.empty?

      unread_statuses_in(counted_ids, account).group('conversations.dm_room_id').count
    end

    private

    def rooms_without_cursor(rooms, account)
      rooms.select do |room|
        room.dm_room_reads.detect { |read| read.account_id == account.id }&.last_read_status_id.nil?
      end
    end

    def legacy_read_room_ids(rooms, account)
      return [] if rooms.empty?

      AccountConversation
        .joins(:conversation)
        .where(account_id: account.id, conversations: { dm_room_id: rooms.map(&:id) })
        .group('conversations.dm_room_id')
        .having('NOT bool_or(account_conversations.unread)')
        .pluck('conversations.dm_room_id')
    end

    def unread_statuses_in(room_ids, account)
      Status
        .direct_visibility
        .joins(:conversation, :mentions)
        .joins(sanitize_sql_array([UNREAD_CURSOR_JOIN, account.id]))
        .where(conversations: { dm_room_id: room_ids }, mentions: { account_id: account.id, silent: false })
        .where.not(account_id: account.id)
        .where.not(account_id: account.excluded_from_timeline_account_ids)
        .where.not(id: DmHiddenStatus.status_ids_for(account))
        .where('dm_room_reads.last_read_status_id IS NULL OR statuses.id > dm_room_reads.last_read_status_id')
        .reorder(nil)
    end
  end

  def participant_read_states_for(account)
    return [] unless read_receipts_enabled?(account)

    cursors = dm_room_reads.index_by(&:account_id)

    members.filter_map do |member|
      next if member.id == account.id
      next unless read_receipts_enabled?(member)

      {
        account_id: member.id.to_s,
        last_read_status_id: cursors[member.id]&.last_read_status_id&.to_s,
      }
    end
  end

  def broadcast_read!(reader)
    return unless read_receipts_enabled?(reader)

    cursor = dm_room_reads.find_by(account_id: reader.id)
    return if cursor&.last_read_status_id.blank?

    message = {
      event: :'dm.read',
      payload: {
        dm_room_id: id.to_s,
        account_id: reader.id.to_s,
        last_read_status_id: cursor.last_read_status_id.to_s,
      },
    }.to_json

    members.each do |member|
      next if member.id == reader.id
      next unless read_receipts_enabled?(member)

      redis.publish("timeline:direct:#{member.id}", message)
    end
  end

  def mark_read_for_author!(status)
    cursor = read_cursor_for(status.account_id)

    broadcast_read!(status.account) if cursor.advance_to!(status.id)
  rescue ActiveRecord::ActiveRecordError => e
    Rails.logger.error { "DmRoom#mark_read_for_author! failed for status #{status.id}: #{e.class} #{e.message}" }
  end

  def read_cursor_for(account_id)
    existing = DmRoomRead.find_by(dm_room_id: id, account_id: account_id)
    return existing if existing

    self.class.transaction(requires_new: true) do
      DmRoomRead.create!(dm_room_id: id, account_id: account_id)
    end
  rescue ActiveRecord::RecordNotUnique
    DmRoomRead.find_by!(dm_room_id: id, account_id: account_id)
  end

  def member_ids
    dm_room_members.pluck(:account_id)
  end

  def accepted_participant_sets
    accounts = Account.where(id: dm_room_members.select(:account_id)).to_a
    all      = self.class.normalize_ids(accounts.map(&:id))
    live     = self.class.normalize_ids(accounts.reject(&:anonymized?).map(&:id))

    [all, live].uniq
  end

  def accepts_participants?(participant_ids)
    accepted_participant_sets.include?(participant_ids)
  end

  def add_members!(author, account_ids)
    requested = self.class.normalize_ids(account_ids) - [author.id]
    return false if requested.empty?

    existing   = member_ids
    returning  = requested & existing
    incoming   = requested - existing

    raise Mastodon::ValidationError, I18n.t('dm_rooms.errors.too_many_recipients', max: MAX_MEMBERS - 1) if (existing | requested).size > MAX_MEMBERS

    if incoming.empty?
      dm_room_members.where(account_id: returning).update_all(hidden_at: nil, updated_at: Time.now.utc)
      return false
    end

    new_ids = self.class.normalize_ids(existing + incoming)
    key     = self.class.participant_key_for(new_ids)
    clash   = self.class.find_by(participant_key: key)

    raise DuplicateRoomError, clash if clash && clash.id != id

    transaction do
      dm_room_members.where(account_id: returning).update_all(hidden_at: nil, updated_at: Time.now.utc) if returning.any?
      incoming.each { |account_id| dm_room_members.create!(account_id: account_id) }
      update!(participant_key: key, member_count: new_ids.size)
    end

    reload_members!
    post_member_event!(author, :added, Account.where(id: incoming).to_a)

    true
  end

  def remove_member!(author, target)
    return false unless dm_room_members.exists?(account_id: target.id)

    remaining = member_ids - [target.id]

    raise Mastodon::ValidationError, I18n.t('dm_rooms.errors.last_members') if remaining.size < 2

    key   = self.class.participant_key_for(remaining)
    clash = self.class.find_by(participant_key: key)

    raise DuplicateRoomError, clash if clash && clash.id != id

    transaction do
      dm_room_members.where(account_id: target.id).destroy_all

      dm_room_reads.where(account_id: target.id).delete_all
      dm_room_nicknames.where(account_id: target.id).delete_all
      dm_room_nicknames.where(target_account_id: target.id).delete_all

      update!(participant_key: key, member_count: remaining.size)
    end

    reload_members!
    post_member_event!(author, :removed, [target])

    true
  end

  def nicknames_for(account)
    rows = if dm_room_nicknames.loaded?
             dm_room_nicknames.select { |row| row.account_id == account.id }.map { |row| [row.target_account_id, row.nickname] }
           else
             dm_room_nicknames.where(account_id: account.id).pluck(:target_account_id, :nickname)
           end

    rows.to_h { |target_id, nickname| [target_id.to_s, nickname] }
  end

  def set_nickname!(account, target, nickname)
    trimmed = nickname.to_s.strip

    if trimmed.empty?
      dm_room_nicknames.where(account_id: account.id, target_account_id: target.id).delete_all
      return
    end

    record = dm_room_nicknames.create_or_find_by!(account_id: account.id, target_account_id: target.id) { |row| row.nickname = trimmed }
    record.update!(nickname: trimmed)
  end

  def change_title!(author, new_title)
    normalized = new_title.to_s.strip.presence

    return false if normalized == title

    update!(title: normalized)
    post_title_event!(author, normalized)

    true
  end

  private

  def reload_members!
    dm_room_members.reset
    members.reset
    reload
  end

  def post_member_event!(author, kind, targets)
    return if targets.empty?

    handles = other_accounts(author).map { |account| "@#{account.acct}" }.join(' ')
    names   = targets.map { |account| author_name(account) }.join(', ')

    body = I18n.t(
      kind == :added ? 'dm_rooms.member_added' : 'dm_rooms.member_removed',
      name: author_name(author),
      targets: names,
      locale: EVENT_LOCALE
    )

    PostStatusService.new.call(
      author,
      text: [handles, body].compact_blank.join(' '),
      visibility: :direct,
      spoiler_text: MEMBER_EVENT_PREFIX,
      thread: root_status,
      with_rate_limit: true,
      dm_room_event: true
    )
  rescue Mastodon::RateLimitExceededError,
         Mastodon::ValidationError,
         PostStatusService::UnexpectedMentionsError,
         ActiveRecord::RecordInvalid => e
    Rails.logger.warn { "dm_room #{id}: member event not posted (#{e.class})" }
    nil
  end

  def post_title_event!(author, new_title)
    handles = other_accounts(author).map { |account| "@#{account.acct}" }.join(' ')

    body = if new_title
             I18n.t('dm_rooms.title_changed', name: author_name(author), title: new_title, locale: EVENT_LOCALE)
           else
             I18n.t('dm_rooms.title_removed', name: author_name(author), locale: EVENT_LOCALE)
           end

    PostStatusService.new.call(
      author,
      text: [handles, body].compact_blank.join(' '),
      visibility: :direct,
      spoiler_text: TITLE_EVENT_PREFIX,
      thread: root_status,

      with_rate_limit: true,
      dm_room_event: true
    )
  rescue Mastodon::RateLimitExceededError,
         Mastodon::ValidationError,
         PostStatusService::UnexpectedMentionsError,
         ActiveRecord::RecordInvalid => e
    Rails.logger.warn { "dm_room #{id}: title event not posted (#{e.class})" }
    nil
  end

  def author_name(author)
    author.display_name.presence || author.username
  end

  def read_receipts_enabled?(account)
    account.user&.settings&.[]('dm_read_receipts') == true
  end
end
