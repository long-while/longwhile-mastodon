# frozen_string_literal: true

# == Schema Information
#
# Table name: statuses
#
#  id                           :bigint(8)        not null, primary key
#  deleted_at                   :datetime
#  edited_at                    :datetime
#  fetched_replies_at           :datetime
#  language                     :string
#  local                        :boolean
#  ordered_media_attachment_ids :bigint(8)        is an Array
#  quote_approval_policy        :integer          default(0), not null
#  reply                        :boolean          default(FALSE), not null
#  sensitive                    :boolean          default(FALSE), not null
#  spoiler_text                 :text             default(""), not null
#  text                         :text             default(""), not null
#  trendable                    :boolean
#  uri                          :string
#  url                          :string
#  visibility                   :integer          default("public"), not null
#  created_at                   :datetime         not null
#  updated_at                   :datetime         not null
#  account_id                   :bigint(8)        not null
#  application_id               :bigint(8)
#  conversation_id              :bigint(8)
#  in_reply_to_account_id       :bigint(8)
#  in_reply_to_id               :bigint(8)
#  poll_id                      :bigint(8)
#  reblog_of_id                 :bigint(8)
#

class Status < ApplicationRecord
  include Cacheable
  include Discard::Model
  include Paginable
  include RateLimitable
  include Status::FaspConcern
  include Status::FetchRepliesConcern
  include Status::SafeReblogInsert
  include Status::SearchConcern
  include Status::SnapshotConcern
  include Status::ThreadingConcern
  include Status::Visibility
  include Status::InteractionPolicyConcern

  CACHEABLE_ASSOCIATIONS = [
    :application,
    :conversation,
    :media_attachments,
    :preloadable_poll,
    :status_stat,
    :tags,
    account: [:account_stat, user: :role],
    active_mentions: :account,
    tagged_objects: :object,
    preview_cards_status: { preview_card: { author_account: [:account_stat, user: :role] } },
    quote: { status: { account: [:account_stat, user: :role] } },
  ].freeze

  MEDIA_ATTACHMENTS_LIMIT = 4

  # Direct messages are a conversation, not something posted to a profile, so
  # they stay out of the visible post count. `tootctl cache recount statuses`
  # has always counted it this way (not_direct_visibility); only the live
  # counter disagreed. Set COUNT_DIRECT_STATUSES=true to include them.
  COUNT_DIRECT_STATUSES = ENV['COUNT_DIRECT_STATUSES'] == 'true'

  rate_limit by: :account, family: :statuses

  self.discard_column = :deleted_at

  # If `override_timestamps` is set at creation time, Snowflake ID creation
  # will be based on current time instead of `created_at`
  attr_accessor :override_timestamps

  update_index('statuses', :proper)
  update_index('public_statuses', :proper)

  belongs_to :application, class_name: 'Doorkeeper::Application', optional: true

  belongs_to :account, inverse_of: :statuses
  belongs_to :in_reply_to_account, class_name: 'Account', optional: true
  belongs_to :conversation, optional: true
  belongs_to :preloadable_poll, class_name: 'Poll', foreign_key: 'poll_id', optional: true, inverse_of: false

  with_options class_name: 'Status', optional: true do
    belongs_to :thread, foreign_key: 'in_reply_to_id', inverse_of: :replies
    belongs_to :reblog, foreign_key: 'reblog_of_id', inverse_of: :reblogs
  end

  has_one :owned_conversation, class_name: 'Conversation', foreign_key: 'parent_status_id', inverse_of: :parent_status, dependent: nil

  has_many :favourites, inverse_of: :status, dependent: :destroy
  has_many :bookmarks, inverse_of: :status, dependent: :destroy
  has_many :reblogs, foreign_key: 'reblog_of_id', class_name: 'Status', inverse_of: :reblog, dependent: :destroy
  has_many :reblogged_by_accounts, through: :reblogs, class_name: 'Account', source: :account
  has_many :replies, foreign_key: 'in_reply_to_id', class_name: 'Status', inverse_of: :thread, dependent: nil
  has_many :mentions, dependent: :destroy, inverse_of: :status
  has_many :mentioned_accounts, through: :mentions, source: :account, class_name: 'Account'
  has_many :media_attachments, dependent: :nullify
  has_many :tagged_objects, dependent: :destroy
  has_many :quotes, foreign_key: 'quoted_status_id', inverse_of: :quoted_status, dependent: :nullify

  # The `dependent` option is enabled by the initial `mentions` association declaration
  has_many :active_mentions, -> { active }, class_name: 'Mention', inverse_of: :status # rubocop:disable Rails/HasManyOrHasOneDependent

  # Those associations are used for the private search index
  has_many :local_mentioned, -> { merge(Account.local) }, through: :active_mentions, source: :account
  has_many :local_favorited, -> { merge(Account.local) }, through: :favourites, source: :account
  has_many :local_reblogged, -> { merge(Account.local) }, through: :reblogs, source: :account
  has_many :local_bookmarked, -> { merge(Account.local) }, through: :bookmarks, source: :account
  has_many :local_replied, -> { merge(Account.local) }, through: :replies, source: :account

  has_and_belongs_to_many :tags # rubocop:disable Rails/HasAndBelongsToMany

  has_one :preview_cards_status, inverse_of: :status, dependent: :delete

  has_one :notification, as: :activity, dependent: :destroy
  has_one :status_stat, inverse_of: :status, dependent: nil
  has_one :poll, inverse_of: :status, dependent: :destroy
  has_one :trend, class_name: 'StatusTrend', inverse_of: :status, dependent: nil
  has_one :quote, inverse_of: :status, dependent: :destroy

  validates :uri, uniqueness: true, presence: true, unless: :local?
  validates :text, presence: true, unless: -> { with_media? || reblog? || with_quote? }
  validates_with StatusLengthValidator
  validates_with DisallowedHashtagsValidator
  validates :reblog, uniqueness: { scope: :account }, if: :reblog?

  accepts_nested_attributes_for :poll

  default_scope { recent.kept }

  scope :recent, -> { reorder(id: :desc) }
  scope :remote, -> { where(local: false).where.not(uri: nil) }
  scope :local,  -> { where(local: true).or(where(uri: nil)) }
  scope :with_accounts, ->(ids) { where(id: ids).includes(:account) }
  scope :without_replies, -> { not_reply.or(reply_to_account) }
  scope :not_reply, -> { where(reply: false) }
  scope :only_reblogs, -> { where.not(reblog_of_id: nil) }
  scope :only_polls, -> { where.not(poll_id: nil) }
  scope :without_polls, -> { where(poll_id: nil) }
  scope :reply_to_account, -> { where(arel_table[:in_reply_to_account_id].eq arel_table[:account_id]) }
  scope :not_replying_to_account, ->(account) { where.not(in_reply_to_account: account) }
  scope :without_reblogs, -> { where(statuses: { reblog_of_id: nil }) }
  scope :tagged_with, ->(tag_ids) { joins(:statuses_tags).where(statuses_tags: { tag_id: tag_ids }) }
  scope :not_excluded_by_account, ->(account) { where.not(account_id: account.excluded_from_timeline_account_ids) }
  scope :not_domain_blocked_by_account, ->(account) { account.excluded_from_timeline_domains.blank? ? left_outer_joins(:account) : left_outer_joins(:account).merge(Account.not_domain_blocked_by_account(account)) }
  scope :tagged_with_all, lambda { |tag_ids|
    Array(tag_ids).map(&:to_i).reduce(self) do |result, id|
      result.where(<<~SQL.squish, tag_id: id)
        EXISTS(SELECT 1 FROM statuses_tags WHERE statuses_tags.status_id = statuses.id AND statuses_tags.tag_id = :tag_id)
      SQL
    end
  }
  scope :tagged_with_none, lambda { |tag_ids|
    where('NOT EXISTS (SELECT * FROM statuses_tags forbidden WHERE forbidden.status_id = statuses.id AND forbidden.tag_id IN (?))', tag_ids)
  }
  scope :without_empty_attachments, -> { where(ordered_media_attachment_ids: nil).or(where.not(ordered_media_attachment_ids: [])) }

  after_create_commit :trigger_create_webhooks
  after_update_commit :trigger_update_webhooks

  after_create_commit  :increment_counter_caches
  after_destroy_commit :decrement_counter_caches

  after_create_commit :store_uri, if: :local?
  after_create_commit :update_statistics, if: :local?

  before_validation :prepare_contents, if: :local?
  before_validation :set_reblog
  before_validation :set_conversation
  before_validation :set_local

  around_create Mastodon::Snowflake::Callbacks

  after_create :set_poll_id
  after_create :update_conversation

  # The `prepend: true` option below ensures this runs before
  # the `dependent: destroy` callbacks remove relevant records
  before_destroy :unlink_from_conversations!, prepend: true

  # @_longwhile — DM 채팅. 마지막 메시지가 사라지면 방의 last_status_id 를 되감는다.
  #   외래키(ON DELETE SET NULL)가 하드 삭제의 참조를 끊어 주지만, 그 다음 메시지로
  #   채우는 것은 여기서 한다.
  #
  #   버려지기만 하는 경우(신고된 글은 RemoveStatusService 가 destroy 하지 않는다)는
  #   discard_with_reblogs 에서 함께 처리한다. after_discard 콜백은 쓸 수 없다 —
  #   그 메서드가 discard 가 아니라 update_attribute 로 컬럼을 쓰기 때문이다.
  #
  #   콜백을 타지 않는 delete_all 경로는 목록 조회 시점에 고쳐진다.
  #   근거: 기획서 US-09, dm-chat-phase-1.md §1.4
  #
  #   이 글을 last_status · root_status 로 든 방은 **destroy 전에** 적어 둔다. 그
  #   컬럼들은 ON DELETE SET NULL 이라 after_destroy 시점에는 이미 비어 있어 찾을
  #   수 없다.
  before_destroy :remember_dm_rooms_holding_self, if: :direct_visibility?
  after_destroy :rewind_dm_room!, if: :direct_visibility?

  cache_associated(
    *CACHEABLE_ASSOCIATIONS,
    reblog: [*CACHEABLE_ASSOCIATIONS],
    thread: :account
  )

  delegate :domain, :indexable?, to: :account, prefix: true

  REAL_TIME_WINDOW = 6.hours

  def cache_key
    "v3:#{super}"
  end

  # @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
  #   `rate_limit by: :account, family: :statuses` 는 클래스 선언 시점에 family 를
  #   고정하므로 공개 범위별로 나눌 수 없다. RateLimitable#rate_limiter 가 인스턴스
  #   메서드이면서 메모이즈된다는 점을 이용해, direct 일 때만 family 를 갈아끼운다.
  #
  #   메모이제이션 덕분에 after_create 와 after_rollback 이 같은 인스턴스를 공유하고,
  #   따라서 기록과 되돌리기가 항상 같은 family 를 향한다. 공개 글 경로는 super 를
  #   그대로 타므로 기존 300/3시간 제한이 바뀌지 않는다.
  #   근거: dm-chat-phase-0.md P0-3, dm-chat-decisions.md D-09
  def rate_limiter(by, options = {})
    return super if defined?(@rate_limiter) || !direct_visibility?

    super(by, options.merge(family: :direct_statuses))
  end

  def to_log_human_identifier
    account.acct
  end

  def to_log_permalink
    ActivityPub::TagManager.instance.uri_for(self)
  end

  def reply?
    !in_reply_to_id.nil? || attributes['reply']
  end

  def local?
    attributes['local'] || uri.nil?
  end

  def in_reply_to_local_account?
    reply? && thread&.account&.local?
  end

  def reblog?
    !reblog_of_id.nil?
  end

  def within_realtime_window?
    created_at >= REAL_TIME_WINDOW.ago
  end

  def verb
    if destroyed?
      :delete
    else
      reblog? ? :share : :post
    end
  end

  def object_type
    reply? ? :comment : :note
  end

  def proper
    reblog? ? reblog : self
  end

  def content
    proper.text
  end

  def target
    reblog
  end

  def preview_card
    preview_cards_status&.preview_card&.tap { |x| x.original_url = preview_cards_status.url }
  end

  def reset_preview_card!
    PreviewCardsStatus.where(status_id: id).delete_all
  end

  def with_media?
    ordered_media_attachments.any?
  end

  def with_quote?
    quote.present?
  end

  def with_preview_card?
    preview_cards_status.present?
  end

  def with_poll?
    preloadable_poll.present?
  end

  def with_quote?
    quote.present?
  end

  def non_sensitive_with_media?
    !sensitive? && with_media?
  end

  def reported?
    @reported ||= account.targeted_reports.unresolved.exists?(['? = ANY(status_ids)', id]) || account.strikes.exists?(['? = ANY(status_ids)', id.to_s])
  end

  def emojis
    return @emojis if defined?(@emojis)

    fields  = [spoiler_text, text]
    fields += preloadable_poll.options unless preloadable_poll.nil?

    @emojis = CustomEmoji.from_text(fields.join(' '), account.domain)
  end

  def ordered_media_attachments
    if ordered_media_attachment_ids.nil?
      # NOTE: sort Ruby-side to avoid hitting the database when the status is
      # not persisted to database yet
      media_attachments.sort_by(&:id)
    else
      map = media_attachments.index_by(&:id)
      ordered_media_attachment_ids.filter_map { |media_attachment_id| map[media_attachment_id] }
    end.take(MEDIA_ATTACHMENTS_LIMIT)
  end

  def replies_count
    status_stat&.replies_count || 0
  end

  def reblogs_count
    status_stat&.reblogs_count || 0
  end

  def favourites_count
    status_stat&.favourites_count || 0
  end

  def quotes_count
    status_stat&.quotes_count || 0
  end

  # Reblogs count received from an external instance
  def untrusted_reblogs_count
    status_stat&.untrusted_reblogs_count unless local?
  end

  # Favourites count received from an external instance
  def untrusted_favourites_count
    status_stat&.untrusted_favourites_count unless local?
  end

  def increment_count!(key)
    if key == :favourites_count && !untrusted_favourites_count.nil?
      update_status_stat!(favourites_count: favourites_count + 1, untrusted_favourites_count: untrusted_favourites_count + 1)
    elsif key == :reblogs_count && !untrusted_reblogs_count.nil?
      update_status_stat!(reblogs_count: reblogs_count + 1, untrusted_reblogs_count: untrusted_reblogs_count + 1)
    else
      update_status_stat!(key => public_send(key) + 1)
    end
  end

  def decrement_count!(key)
    if key == :favourites_count && !untrusted_favourites_count.nil?
      update_status_stat!(favourites_count: [favourites_count - 1, 0].max, untrusted_favourites_count: [untrusted_favourites_count - 1, 0].max)
    elsif key == :reblogs_count && !untrusted_reblogs_count.nil?
      update_status_stat!(reblogs_count: [reblogs_count - 1, 0].max, untrusted_reblogs_count: [untrusted_reblogs_count - 1, 0].max)
    else
      update_status_stat!(key => [public_send(key) - 1, 0].max)
    end
  end

  def trendable?
    if attributes['trendable'].nil?
      account.trendable?
    else
      attributes['trendable']
    end
  end

  def requires_review?
    attributes['trendable'].nil? && account.requires_review?
  end

  def requires_review_notification?
    attributes['trendable'].nil? && account.requires_review_notification?
  end

  class << self
    def favourites_map(status_ids, account_id)
      Favourite.select(:status_id).where(status_id: status_ids).where(account_id: account_id).to_h { |f| [f.status_id, true] }
    end

    def bookmarks_map(status_ids, account_id)
      Bookmark.select(:status_id).where(status_id: status_ids).where(account_id: account_id).to_h { |f| [f.status_id, true] }
    end

    def reblogs_map(status_ids, account_id)
      unscoped.select(:reblog_of_id).where(reblog_of_id: status_ids).where(account_id: account_id).to_h { |s| [s.reblog_of_id, true] }
    end

    # 삭제한 답글은 세지 않는다(`kept`). 시리얼라이저의 다른 분기(`object.proper.replies`)와
    # StatusCacheHydrator 가 그렇게 센다 — 어긋나면 같은 멘션이 화면마다 "답장함" 이 달라진다.
    def replies_map(status_ids, account_id)
      unscoped.kept.select(:in_reply_to_id).where(in_reply_to_id: status_ids).where(account_id: account_id).each_with_object({}) { |s, h| h[s.in_reply_to_id] = true }
    end

    def mutes_map(conversation_ids, account_id)
      ConversationMute.select(:conversation_id).where(conversation_id: conversation_ids).where(account_id: account_id).to_h { |m| [m.conversation_id, true] }
    end

    def pins_map(status_ids, account_id)
      StatusPin.select(:status_id).where(status_id: status_ids).where(account_id: account_id).to_h { |p| [p.status_id, true] }
    end

    def from_text(text)
      return [] if text.blank?

      text.scan(FetchLinkCardService::URL_PATTERN).map(&:second).uniq.filter_map do |url|
        status = if TagManager.instance.local_url?(url)
                   ActivityPub::TagManager.instance.uri_to_resource(url, Status)
                 else
                   EntityCache.instance.status(url)
                 end

        status&.distributable? ? status : nil
      end
    end
  end

  def status_stat
    super || build_status_stat
  end

  def discard_with_reblogs
    discard_time = Time.current
    Status.unscoped.where(reblog_of_id: id, deleted_at: [nil, deleted_at]).in_batches.update_all(deleted_at: discard_time) unless reblog?
    update_attribute(:deleted_at, discard_time)

    # @_longwhile — DM 채팅. 버려진 글은 belongs_to :last_status 의 kept 스코프에
    #   걸려 nil 로 풀리므로, 방 목록의 미리보기가 빈 채로 남는다. 되감아 준다.
    rewind_dm_room! if direct_visibility?
  end

  # conversation 의 방만 되감으면 부족하다. 다른 방의 스레드에 들어간 글이 그 글의
  # 방에서 last_status · root_status 로 잡혀 있을 수 있고(DmRoom.thread_accepts?),
  # 그 방을 놓치면 지워진 글을 루트로 든 채 남아 다시 보내도 같은 곳으로 간다.
  def rewind_dm_room!
    return unless Mastodon::DmChat.enabled?

    rooms = DmRoom.where(id: @dm_room_ids_holding_self || dm_room_ids_holding_self).to_a
    rooms << conversation.dm_room if conversation&.dm_room

    rooms.uniq(&:id).each(&:rewind_last_status!)
  end

  def remember_dm_rooms_holding_self
    @dm_room_ids_holding_self = dm_room_ids_holding_self if Mastodon::DmChat.enabled?
  end

  def dm_room_ids_holding_self
    DmRoom.where(last_status_id: id).or(DmRoom.where(root_status_id: id)).pluck(:id)
  end

  def unlink_from_conversations!
    return unless direct_visibility?

    inbox_owners = mentioned_accounts.local
    inbox_owners += [account] if account.local?

    inbox_owners.each do |inbox_owner|
      AccountConversation.remove_status(inbox_owner, self)
    end
  end

  private

  def update_status_stat!(attrs)
    return if marked_for_destruction? || destroyed?

    status_stat.update(attrs)
  end

  def store_uri
    update_column(:uri, ActivityPub::TagManager.instance.uri_for(self)) if uri.nil?
  end

  def prepare_contents
    text&.strip!
    spoiler_text&.strip!
  end

  def set_reblog
    self.reblog = reblog.reblog if reblog? && reblog.reblog?
  end

  def set_poll_id
    update_column(:poll_id, poll.id) if association(:poll).loaded? && poll.present?
  end

  def set_conversation
    self.thread = thread.reblog if thread&.reblog?

    self.reply = !(in_reply_to_id.nil? && thread.nil?) unless reply

    if reply? && !thread.nil?
      self.in_reply_to_account_id = carried_over_reply_to_account_id
      self.conversation_id        = thread.conversation_id if conversation_id.nil?
    elsif conversation_id.nil?
      build_conversation
    end
  end

  def update_conversation
    return if reply?

    conversation.update!(parent_status: self, parent_account: account) if conversation && conversation.parent_status.nil?
  end

  def carried_over_reply_to_account_id
    if thread.account_id == account_id && thread.reply?
      thread.in_reply_to_account_id
    else
      thread.account_id
    end
  end

  def set_local
    self.local = account.local?
  end

  # 인스턴스 활동량 집계. distributable? 로 두면 이 인스턴스에서는 언제나 거짓이라
  # 관리 화면의 활동 그래프가 0 으로 고정된다. 내용이 아니라 건수만 세므로 DM 만 뺀다.
  def update_statistics
    return if direct_visibility? || limited_visibility?

    ActivityTracker.increment('activity:statuses:local')
  end

  def increment_counter_caches
    return if uncounted?

    account&.increment_count!(:statuses_count, status_created_at: created_at)
    reblog&.increment_count!(:reblogs_count) if reblog?
    thread&.increment_count!(:replies_count) if in_reply_to_id.present?
  end

  def decrement_counter_caches
    return if new_record?
    # Symmetrical with increment_counter_caches: a post that never raised the
    # counter must not lower it. Visibility cannot change after creation, so the
    # two calls always agree.
    return if uncounted?

    account&.decrement_count!(:statuses_count)
    reblog&.decrement_count!(:reblogs_count) if reblog?
    thread&.decrement_count!(:replies_count) if in_reply_to_id.present?
  end

  def uncounted?
    direct_visibility? && !COUNT_DIRECT_STATUSES
  end

  def trigger_create_webhooks
    TriggerWebhookWorker.perform_async('status.created', 'Status', id) if local?
  end

  def trigger_update_webhooks
    TriggerWebhookWorker.perform_async('status.updated', 'Status', id) if local?
  end
end
