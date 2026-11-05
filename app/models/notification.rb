# frozen_string_literal: true

# == Schema Information
#
# Table name: notifications
#
#  id              :bigint(8)        not null, primary key
#  activity_type   :string           not null
#  filtered        :boolean          default(FALSE), not null
#  group_key       :string
#  type            :string
#  created_at      :datetime         not null
#  updated_at      :datetime         not null
#  account_id      :bigint(8)        not null
#  activity_id     :bigint(8)        not null
#  from_account_id :bigint(8)        not null
#

class Notification < ApplicationRecord
  self.inheritance_column = nil

  include Notification::Groups
  include Paginable
  include Redisable

  LEGACY_TYPE_CLASS_MAP = {
    'Direct' => :direct,
    'Mention' => :mention,
    'Status' => :reblog,
    'Follow' => :follow,
    'FollowRequest' => :follow_request,
    'Favourite' => :favourite,
    'Poll' => :poll,
    'Quote' => :quote,
  }.freeze

  # Please update app/javascript/mastodon/api_types/notifications.ts if you change this
  PROPERTIES = {
    # @_longwhile — DM 알림. 상류 4.6 의 fallback 판정(NotificationFallbackConcern)이
    # baseline 이 아닌 타입에 대체 문구를 붙이므로, mention 과 같이 baseline 으로 둔다.
    direct: {
      filterable: true,
      baseline: true,
    }.freeze,
    mention: {
      filterable: true,
      baseline: true,
    }.freeze,
    status: {
      filterable: false,
      baseline: true,
    }.freeze,
    reblog: {
      filterable: true,
      baseline: true,
    }.freeze,
    follow: {
      filterable: true,
      baseline: true,
    }.freeze,
    follow_request: {
      filterable: true,
      baseline: true,
    }.freeze,
    favourite: {
      filterable: true,
      baseline: true,
    }.freeze,
    poll: {
      filterable: false,
      baseline: true,
    }.freeze,
    update: {
      filterable: false,
      baseline: true,
    }.freeze,
    severed_relationships: {
      filterable: false,
      baseline: false,
    }.freeze,
    moderation_warning: {
      filterable: false,
      baseline: false,
    }.freeze,
    annual_report: {
      filterable: false,
      baseline: true,
    }.freeze,
    'admin.sign_up': {
      filterable: false,
      baseline: false,
    }.freeze,
    'admin.report': {
      filterable: false,
      baseline: false,
    }.freeze,
    quote: {
      filterable: true,
      baseline: true,
    }.freeze,
    quoted_update: {
      filterable: false,
      baseline: true,
    }.freeze,
    added_to_collection: {
      filterable: true,
      baseline: false,
    }.freeze,
    collection_update: {
      filterable: false,
      baseline: false,
    }.freeze,
  }.freeze

  TYPES = PROPERTIES.keys.freeze

  TARGET_STATUS_INCLUDES_BY_TYPE = {
    status: :status,
    reblog: [status: :reblog],
    direct: [mention: :status],
    mention: [mention: :status],
    quote: [quote: :status],
    favourite: [favourite: :status],
    poll: [poll: :status],
    update: :status,
    quoted_update: :status,
    'admin.report': [report: :target_account],
  }.freeze

  belongs_to :account, optional: true
  belongs_to :from_account, class_name: 'Account', optional: true
  belongs_to :activity, polymorphic: true, optional: true

  with_options foreign_key: 'activity_id', optional: true do
    belongs_to :mention, inverse_of: :notification
    belongs_to :direct, inverse_of: :notification
    belongs_to :status, inverse_of: :notification
    belongs_to :follow, inverse_of: :notification
    belongs_to :follow_request, inverse_of: :notification
    belongs_to :favourite, inverse_of: :notification
    belongs_to :poll, inverse_of: false
    belongs_to :report, inverse_of: false
    belongs_to :account_relationship_severance_event, inverse_of: false
    belongs_to :account_warning, inverse_of: false
    belongs_to :generated_annual_report, inverse_of: false
    belongs_to :quote, inverse_of: :notification
    belongs_to :collection_item, inverse_of: false # TODO: have an inverse?
    belongs_to :collection, inverse_of: :notifications
  end

  validates :type, inclusion: { in: TYPES }

  scope :without_suspended, -> { joins(:from_account).merge(Account.without_suspended) }
  scope :without_unavailable, -> { joins(:from_account).merge(Account.without_unavailable) }

  def type
    @type ||= (super || LEGACY_TYPE_CLASS_MAP[activity_type]).to_sym
  end

  def target_status
    case type
    when :status, :update, :quoted_update
      status
    when :reblog
      status&.reblog
    when :favourite
      favourite&.status
    when :mention
      mention&.status
    when :direct
      mention&.status
    when :quote
      quote&.status
    when :poll
      poll&.status
    end
  end

  def target_collection
    case type
    when :added_to_collection
      collection_item&.collection
    when :collection_update
      collection
    end
  end

  class << self
    def browserable(types: [], exclude_types: [], from_account_id: nil, include_filtered: false, include_direct_messages: true)
      requested_types = if types.empty?
                          TYPES
                        else
                          types.map(&:to_sym) & TYPES
                        end

      requested_types -= exclude_types.map(&:to_sym)

      # @_longwhile — 마지막의 둘(`without_direct_messages` · `without_unavailable`)
      #   이 우리 것이다. 위의 `merge!` 들에 끼워 넣지 않고 뒤에 이어 붙인다 —
      #   그쪽은 컬럼 조건이라 merge 가 안전하지만, 우리 것은 원시 SQL 과 조인이라
      #   merge 의 중복 제거 규칙에 기대고 싶지 않다.
      #
      #   `include_direct_messages` 의 **기본값이 참인 것에 뜻이 있다.** 한때는
      #   거짓이었고, 보고 싶은 쪽(자동봇)이 파라미터를 보내 여는 구조였다. 그
      #   방식은 **파라미터를 모르는 클라이언트를 전부 막는다** — 공식 모바일 앱의
      #   알림 탭에 DM 이 아예 뜨지 않던 것이 그것이다. 앱은 고칠 수 없다.
      #
      #   그래서 방향을 뒤집었다. **기본은 보인다. 빼는 쪽이 말한다.**
      #   말하는 것은 우리 웹 UI 하나뿐이고(`exclude_direct_messages=true`,
      #   api/notifications.ts), 웹에서 DM 이 알림함에 뜨면 안 되는 이유는 아래
      #   `without_direct_messages` 의 주석에 있다.
      #
      #   판정을 계정이 아니라 **요청**에 거는 것은 그대로다. 자동봇을 돌리는 계정이
      #   사람도 함께 쓰는 계정인 경우가 흔해서 "봇 계정" 플래그로는 가를 수 없다.
      #   같은 계정이 웹에서는 안 보고 봇에서는 본다.
      scope = all.tap do |relation|
        relation.merge!(where(filtered: false)) unless include_filtered || from_account_id.present?
        relation.merge!(where(from_account_id: from_account_id)) if from_account_id.present?
        relation.merge!(where(type: requested_types)) unless requested_types.size == TYPES.size
      end

      scope = scope.without_direct_messages unless include_direct_messages
      scope.without_unavailable
    end

    # @_longwhile — 탈퇴한 사람의 알림은 띄우지 않는다.
    #
    #   컨트롤러가 이미 `without_suspended` 를 걸고 있는데도 안 걸러지던 이유가
    #   있다. **탈퇴는 정지가 아니다.** 글을 남기고 나가는 모드에서
    #   `DeleteAccountService` 는 `suspended_at` 을 nil 로 두고 `anonymized_at` 만
    #   채운다(§236~239) — 표시 이름만 "탈퇴한 사용자" 로 바뀐 채 계정 행이
    #   살아 있다. 정지 조건으로는 잡히지 않는다.
    #
    #   `browserable` 에 거는 이유는 `without_direct_messages` 와 같다. 그 하나가
    #   v1·v2 목록과 안 읽은 개수, 그리고 "답장할 멘션" 탭까지 전부 지나가는
    #   길목이라 여기 걸면 빠지는 화면이 없다 — 답장할 멘션은 알림 그룹을 그대로
    #   받아 거르는 화면이다(selectors/notifications.ts).
    #
    #   **알림 행은 지우지 않는다.** 사용자의 데이터이고, 계정이 되살아나면
    #   (`anonymized_at` 이 지워지면) 알림도 그대로 돌아와야 한다.

    # @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
    #   **DM 은 알림함에 올리지 않는다.** 알릴 곳이 /messages 로 옮겨졌다 —
    #   내비의 "채팅" 에 안 읽은 수가 배지로 뜨고 도착하면 소리가 난다.
    #   같은 것이 알림함에 한 번 더 쌓이면 읽음 상태가 두 곳으로 갈린다.
    #
    #   **만드는 쪽은 이미 막아 두었다**(NotifyService#call). 그런데도 여기서 다시
    #   거르는 이유가 둘이다.
    #
    #     1. 그 변경 **이전에 쌓인 알림**이 그대로 남아 있다. 지우지 않는다 —
    #        사용자의 데이터이고, 기능을 되돌리면 그대로 돌아와야 한다.
    #     2. 알림을 만드는 경로가 하나뿐이라는 보장이 코드에 적혀 있지 않다.
    #        조회 쪽에도 걸어두면 어느 경로로 들어오든 화면에는 안 뜬다.
    #
    #   `browserable` 안에서만 부른다. 그 하나가 v1·v2 목록과 안 읽은 개수까지
    #   전부 지나가는 길목이라, 여기 걸면 빠지는 화면이 없다.
    #
    #   판정은 `activity_type` 으로 한다. `notifications.type` 을 보면 안 된다 —
    #   옛 행에는 그 컬럼이 NULL 이고(LEGACY_TYPE_CLASS_MAP 이 그때 `activity_type`
    #   으로 되짚는다), 지금 지우려는 것이 바로 그 옛 행들이다. `activity_type` 은
    #   NOT NULL 이라 어느 시기의 행에도 들어 있다.
    #
    #   멘션이 아닌 알림에서는 서브쿼리의 첫 조건(`activity_type = 'Mention'`)이
    #   바로 거짓이라 그대로 통과한다. 실제로 훑는 것은 멘션뿐이고, 그것도
    #   mentions/statuses 의 기본키 조회 둘이라 행마다 붙는 비용이 작다.
    #
    #   4.5 의 인용도 DM 을 알림함으로 끌고 온다. 공지 글을 인용한 DM 을 보내면
    #   인용당한 쪽(멘션된 참여자다)에게 멘션과 함께 `quote` 알림(activity 는 Quote)이
    #   생기고, 인용 글을 고치면 인용한 쪽에게 `quoted_update`(activity 는 그 DM)가
    #   생긴다. 같은 이유로 둘 다 뺀다.
    def without_direct_messages
      where(
        <<~SQL.squish,
          NOT EXISTS (
            SELECT 1
              FROM mentions
              INNER JOIN statuses ON statuses.id = mentions.status_id
             WHERE notifications.activity_type = 'Mention'
               AND mentions.id = notifications.activity_id
               AND statuses.visibility = :direct
          )
          AND NOT EXISTS (
            SELECT 1
              FROM quotes
              INNER JOIN statuses ON statuses.id = quotes.status_id
             WHERE notifications.activity_type = 'Quote'
               AND quotes.id = notifications.activity_id
               AND statuses.visibility = :direct
          )
          AND NOT EXISTS (
            SELECT 1
              FROM statuses
             WHERE notifications.activity_type = 'Status'
               AND statuses.id = notifications.activity_id
               AND statuses.visibility = :direct
          )
        SQL
        direct: Status.visibilities[:direct]
      )
    end

    def preload_cache_collection_target_statuses(notifications, &_block)
      notifications.group_by(&:type).each do |type, grouped_notifications|
        associations = TARGET_STATUS_INCLUDES_BY_TYPE[type]
        next unless associations

        # Instead of using the usual `includes`, manually preload each type.
        # If polymorphic associations are loaded with the usual `includes`, other types of associations will be loaded more.
        ActiveRecord::Associations::Preloader.new(records: grouped_notifications, associations: associations).call
      end

      unique_target_statuses = notifications.filter_map(&:target_status).uniq
      # Call cache_collection in block
      cached_statuses_by_id = yield(unique_target_statuses).index_by(&:id)

      notifications.each do |notification|
        next if notification.target_status.nil?

        cached_status = cached_statuses_by_id[notification.target_status.id]

        case notification.type
        when :status, :update, :quoted_update
          notification.status = cached_status
        when :reblog
          notification.status.reblog = cached_status
        when :favourite
          notification.favourite.status = cached_status
        when :mention, :direct
          notification.mention.status = cached_status
        when :poll
          notification.poll.status = cached_status
        when :quote
          notification.quote.status = cached_status
        end
      end

      notifications
    end
  end

  after_initialize :set_from_account
  before_validation :set_from_account

  after_destroy :remove_from_notification_request

  private

  def set_from_account
    return unless new_record?

    case activity_type
    when 'Status'
      self.from_account_id = type == :quoted_update ? activity&.quote&.quoted_account_id : activity&.account_id
    when 'Follow', 'Favourite', 'FollowRequest', 'Poll', 'Report', 'Quote', 'Collection'
      self.from_account_id = activity&.account_id
    when 'CollectionItem'
      self.from_account_id = activity&.collection&.account_id
    when 'Mention', 'Direct'
      self.from_account_id = activity&.status&.account_id
    when 'Account'
      self.from_account_id = activity&.id
    when 'AccountRelationshipSeveranceEvent', 'AccountWarning', 'GeneratedAnnualReport'
      # These do not really have an originating account, but this is mandatory
      # in the data model, and the recipient's account will by definition
      # always exist
      self.from_account_id = account_id
    end
  end

  def remove_from_notification_request
    notification_request = NotificationRequest.find_by(account_id: account_id, from_account_id: from_account_id)
    notification_request&.reconsider_existence!
  end
end
