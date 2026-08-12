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
#  last_status_id  :bigint(8)
#  root_status_id  :bigint(8)
#

# @_longwhile custom feature
class DmRoom < ApplicationRecord
  has_many :dm_room_members, dependent: :destroy
  has_many :dm_room_reads, dependent: :destroy
  has_many :members, through: :dm_room_members, source: :account
  has_many :conversations, dependent: nil, inverse_of: :dm_room

  belongs_to :root_status, class_name: 'Status', optional: true
  belongs_to :last_status, class_name: 'Status', optional: true

  validates :participant_key, presence: true

  STATUS_SCAN_LIMIT = 200

  scope :visible_to, lambda { |account|
    joins(:dm_room_members).merge(DmRoomMember.visible.where(account_id: account.id))
  }

  def group?
    member_count > 2
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

    def find_or_create_for(account_ids)
      ids = normalize_ids(account_ids)
      key = participant_key_for(ids)

      existing = find_by(participant_key: key)
      return existing if existing

      begin
        transaction(requires_new: true) do
          room = create!(participant_key: key, member_count: ids.size)
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

      room = find_or_create_for(participant_ids)
      room.attach_conversation!(status.conversation_id)
      room.register_status!(status, resurrect: resurrect)
      room
    end

    def participants_for(status)
      normalize_ids(status.active_mentions.pluck(:account_id) + [status.account_id])
    end
  end

  def attach_conversation!(conversation_id)
    Conversation.where(id: conversation_id, dm_room_id: nil).update_all(dm_room_id: id)
  end

  def register_status!(status, resurrect: true)
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

    scope.where(account_id: account.id).or(
      scope.where(id: Mention.active.where(account_id: account.id).select(:status_id))
    )
  end

  def other_accounts(account)
    members.reject { |member| member.id == account.id }
  end

  def unread_count_for(account)
    cursor = dm_room_reads.detect { |read| read.account_id == account.id }

    return 0 if cursor&.last_read_status_id.nil? && read_in_legacy_client?(account)

    scope = visible_statuses_for(account).where.not(account_id: account.id)
    scope = scope.where(id: (cursor.last_read_status_id + 1)..) if cursor&.last_read_status_id

    scope.count
  end

  def read_in_legacy_client?(account)
    legacy = AccountConversation.where(account_id: account.id, conversation_id: conversations.select(:id))

    legacy.exists? && !legacy.exists?(unread: true)
  end
end
