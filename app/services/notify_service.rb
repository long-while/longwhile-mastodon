# frozen_string_literal: true

class NotifyService < BaseService
  include Redisable

  # TODO: the severed_relationships and annual_report types probably warrants email notifications
  NON_EMAIL_TYPES = %i(
    admin.report
    admin.sign_up
    update
    quoted_update
    poll
    status
    moderation_warning
    severed_relationships
    annual_report
    added_to_collection
    collection_update
  ).freeze

  class BaseCondition
    NEW_ACCOUNT_THRESHOLD = 30.days.freeze

    NEW_FOLLOWER_THRESHOLD = 3.days.freeze

    def initialize(notification, **options)
      @recipient = notification.account
      @sender = notification.from_account
      @notification = notification
      @policy = NotificationPolicy.find_or_initialize_by(account: @recipient)
      @from_staff = @sender.local? && @sender.user.present? && @sender.user_role&.bypass_block?(@recipient.user_role)
      @options = options
    end

    private

    def filterable_type?
      Notification::PROPERTIES[@notification.type][:filterable]
    end

    def not_following?
      !@recipient.following?(@sender)
    end

    def not_follower?
      follow = Follow.find_by(account: @sender, target_account: @recipient)
      follow.nil? || follow.created_at > NEW_FOLLOWER_THRESHOLD.ago
    end

    def new_account?
      @sender.created_at > NEW_ACCOUNT_THRESHOLD.ago
    end

    def override_for_sender?
      NotificationPermission.exists?(account: @recipient, from_account: @sender)
    end

    def message?
      [:mention, :direct].include?(@notification.type)
    end

    def from_staff?
      @from_staff
    end

    def private_mention_not_in_response?
      @notification.type == :mention && @notification.target_status.direct_visibility? && !response_to_recipient?
    end

    def response_to_recipient?
      return false if @notification.target_status.in_reply_to_id.nil?

      statuses_that_mention_sender.positive?
    end

    def statuses_that_mention_sender
      # This queries private mentions from the recipient to the sender up in the thread.
      # This allows up to 100 messages that do not match in the thread, allowing conversations
      # involving multiple people.
      Status.count_by_sql([<<~SQL.squish, id: @notification.target_status.in_reply_to_id, recipient_id: @recipient.id, sender_id: @sender.id, depth_limit: 100])
        WITH RECURSIVE ancestors(id, in_reply_to_id, mention_id, path, depth) AS (
            SELECT s.id, s.in_reply_to_id, m.id, ARRAY[s.id], 0
            FROM statuses s
            LEFT JOIN mentions m ON m.silent = FALSE AND m.account_id = :sender_id AND m.status_id = s.id
            WHERE s.id = :id
          UNION ALL
            SELECT s.id, s.in_reply_to_id, m.id, ancestors.path || s.id, ancestors.depth + 1
            FROM ancestors
            JOIN statuses s ON s.id = ancestors.in_reply_to_id
            /* early exit if we already have a mention matching our requirements */
            LEFT JOIN mentions m ON m.silent = FALSE AND m.account_id = :sender_id AND m.status_id = s.id AND s.account_id = :recipient_id
            WHERE ancestors.mention_id IS NULL AND NOT s.id = ANY(path) AND ancestors.depth < :depth_limit
        )
        SELECT COUNT(*)
        FROM ancestors
        JOIN statuses s ON s.id = ancestors.id
        WHERE ancestors.mention_id IS NOT NULL AND s.account_id = :recipient_id AND s.visibility = 3
      SQL
    end

    def from_bot?
      @sender.bot?
    end
  end

  class DropCondition < BaseCondition
    def drop?
      blocked   = @recipient.unavailable?
      blocked ||= from_self? && %i(poll severed_relationships moderation_warning annual_report).exclude?(@notification.type)

      return blocked if message? && from_staff?

      blocked ||= domain_blocking?
      blocked ||= @recipient.blocking?(@sender)
      blocked ||= edit_from_blocking_author?
      blocked ||= @recipient.muting_notifications?(@sender)
      blocked ||= conversation_muted?
      blocked ||= dm_room_event? if message?
      blocked ||= blocked_mention? if message?

      return true if blocked
      return false unless filterable_type?
      return false if override_for_sender?

      blocked_by_limited_accounts_policy? ||
        blocked_by_not_following_policy? ||
        blocked_by_not_followers_policy? ||
        blocked_by_new_accounts_policy? ||
        blocked_by_private_mentions_policy? ||
        blocked_by_bots_policy?
    end

    private

    def blocked_mention?
      FeedManager.instance.filter?(:mentions, @notification.target_status, @recipient)
    end

    # @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
    #   방 제목 변경 안내는 알림을 만들지 않는다. (docs/dm-chat/phases/dm-chat-phase-5.md §3.3)
    #
    #   그 안내는 별도 테이블이 아니라 멤버 전원을 멘션한 평범한 direct status 다.
    #   그래야 시간순 위치가 저절로 잡히고 방 귀속 경로를 그대로 탄다. 대가로 알림
    #   경로도 그대로 타서, 제목을 바꿀 때마다 전원의 알림함이 울린다.
    #
    #   안 읽은 개수는 그대로 둔다 — 방에 무언가 일어난 것은 맞다. 빼려면
    #   DmRoom.unread_counts_for 의 쿼리에 조건을 더해야 하는데 그 자리는 목록을
    #   열 때마다 도는 곳이라 조건을 늘릴 데가 아니다.
    def dm_room_event?
      @notification.target_status&.spoiler_text&.start_with?(DmRoom::TITLE_EVENT_PREFIX) || false
    end

    def from_self?
      @recipient.id == @sender.id
    end

    # 'update' 알림에는 고친 글의 본문이 실린다. 받는 사람은 그 글을 부스트한 사람인데,
    # 이 포크에서는 남의 비공개 글도 부스트할 수 있어서, 원작자가 차단한 뒤에도 고칠
    # 때마다 새 본문을 받았다. 업스트림은 공개 글만 부스트되어 이 경로가 없었다.
    def edit_from_blocking_author?
      @notification.type == :update && @sender.blocking?(@recipient)
    end

    def domain_blocking?
      @recipient.domain_blocking?(@sender.domain) && not_following?
    end

    def conversation_muted?
      @notification.target_status && @recipient.muting_conversation?(@notification.target_status.conversation)
    end

    def blocked_by_not_following_policy?
      @policy.drop_not_following? && not_following?
    end

    def blocked_by_not_followers_policy?
      @policy.drop_not_followers? && not_follower?
    end

    def blocked_by_new_accounts_policy?
      @policy.drop_new_accounts? && new_account? && not_following?
    end

    def blocked_by_private_mentions_policy?
      @policy.drop_private_mentions? && not_following? && private_mention_not_in_response?
    end

    def blocked_by_limited_accounts_policy?
      @policy.drop_limited_accounts? && (@options[:silenced] || @sender.silenced?) && not_following?
    end

    def blocked_by_bots_policy?
      @policy.drop_bots? && from_bot? && not_following?
    end
  end

  class FilterCondition < BaseCondition
    def filter?
      return false unless filterable_type?
      return false if override_for_sender?
      return false if message? && from_staff?

      filtered_by_limited_accounts_policy? ||
        filtered_by_not_following_policy? ||
        filtered_by_not_followers_policy? ||
        filtered_by_new_accounts_policy? ||
        filtered_by_private_mentions_policy? ||
        filtered_by_bots_policy?
    end

    private

    def filtered_by_not_following_policy?
      @policy.filter_not_following? && not_following?
    end

    def filtered_by_not_followers_policy?
      @policy.filter_not_followers? && not_follower?
    end

    def filtered_by_new_accounts_policy?
      @policy.filter_new_accounts? && new_account? && not_following?
    end

    def filtered_by_private_mentions_policy?
      @policy.filter_private_mentions? && not_following? && private_mention_not_in_response?
    end

    def filtered_by_limited_accounts_policy?
      @policy.filter_limited_accounts? && (@options[:silenced] || @sender.silenced?) && not_following?
    end

    def filtered_by_bots_policy?
      @policy.filter_bots? && from_bot? && not_following?
    end
  end

  def call(recipient, type, activity, **options)
    return if recipient.user.nil?

    @options      = options
    @recipient    = recipient
    @activity     = activity
    @notification = Notification.new(account: @recipient, type: type, activity: @activity)

    # For certain conditions we don't need to create a notification at all
    return if drop?

    # @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
    #   **DM 알림은 만들되 사람에게는 보이지 않는다.**
    #
    #   알릴 곳은 /messages 로 옮겨졌다 — 내비의 "채팅" 에 안 읽은 수가 배지로
    #   뜨고, 도착하면 소리가 난다(navigation_panel 의 MessagesLink,
    #   actions/streaming.js). 그래서 한동안 레코드 자체를 만들지 않았는데, 그
    #   방식은 **API 로 도는 자동봇을 통째로 먹통으로 만든다.** 봇은 멘션 알림으로
    #   명령어를 받는데 DM 이 채팅이 되면서 모든 명령어가 direct 로 오기 때문이다.
    #
    #   "봇 계정" 플래그로 예외를 주는 방법은 쓰지 않는다. 자동봇을 돌리는 계정이
    #   사람도 함께 쓰는 계정인 경우가 흔해서, 그 체크 하나에 프로필 표시와 검색
    #   취급이 함께 딸려간다.
    #
    #   그래서 레코드는 모두에게 만들고, **사람이 보는 통로에서만 뺀다.**
    #
    #     목록 · 안 읽은 개수   Notification.browserable 의 without_direct_messages
    #     실시간 알림함         actions/streaming.js 에서 direct 멘션 무시
    #     웹 푸시 · 메일        아래에서 건너뛴다
    #     알림 요청함           아래에서 건너뛴다 (filtered 판정을 하지 않으므로)
    #
    #   남는 통로는 스트리밍 이벤트 하나뿐이고, 그것을 보는 것은 자동봇이다.
    #
    #   **DM 은 filtered 로 두지 않는다.** 필터링은 알림함을 위한 장치인데 DM 은
    #   알림함에 뜨지 않으므로 가릴 것이 없고, 남겨 두면 `for_private_mentions` 의
    #   기본값(filter) 때문에 **봇이 팔로우하지 않은 사람의 명령어가 조용히
    #   사라진다.** 차단·뮤트는 위의 `drop?` 이 이미 걸렀다.
    #
    #   같은 이유로 대화 목록 갱신도 조건 없이 한다. 방 목록(dm_rooms)은 status
    #   에서 직접 만들어지므로 어차피 보이는데, account_conversations 만 빠지면
    #   두 화면이 어긋나고 ADR-005 의 읽음 화해(DmRoom.unread_counts_for)가
    #   근거를 잃는다.
    #
    #   DM_CHAT_ENABLED 가 꺼져 있으면 위의 어느 것도 하지 않는다. 플래그를 내리면
    #   알림함·푸시·메일이 상류 그대로 돌아와야 되돌리기가 성립한다.
    @notification.filtered = dm_chat_message? || direct_quote? ? false : filter?
    @notification.set_group_key!
    @notification.save!

    # It's possible the underlying activity has been deleted
    # between the save call and now
    return if @notification.activity.nil?

    if dm_chat_message?
      push_to_streaming_api! if subscribed_to_streaming_api?
      push_to_conversation!
      # @_longwhile — DM 채팅의 앱 푸시. 브라우저만 빼고 전부 보낸다.
      push_to_app_subscriptions!
    elsif direct_quote?
      # @_longwhile — DM 을 인용한(또는 인용한 원문이 고쳐진) 알림. 같은 DM 의 멘션이
      #   위의 채팅 경로로 이미 알렸으므로 사람 통로(웹·앱 푸시, 메일, 알림 요청함)로는
      #   다시 내지 않는다. 스트리밍도 건너뛴다 — 고정 화면의 실시간 알림함은 direct
      #   멘션만 거르므로 quote 이벤트는 그대로 알림함에 꽂힌다. 레코드는 남아
      #   exclude_direct_messages 를 보내지 않는 클라이언트(자동봇)는 API 로 본다.
      nil
    elsif @notification.filtered?
      update_notification_request!
    else
      push_notification!
      push_to_conversation! if direct_message?
      send_email! if email_needed?
    end
  rescue ActiveRecord::RecordInvalid
    nil
  end

  private

  def drop?
    DropCondition.new(@notification, silenced: @options[:silenced]).drop?
  end

  def filter?
    FilterCondition.new(@notification, silenced: @options[:silenced]).filter?
  end

  def update_notification_request!
    return unless %i(mention quote).include?(@notification.type)

    notification_request = NotificationRequest.find_or_initialize_by(account_id: @recipient.id, from_account_id: @notification.from_account_id)
    notification_request.last_status_id = @notification.target_status.id
    notification_request.save
  end

  def push_notification!
    push_to_streaming_api! if subscribed_to_streaming_api?
    push_to_web_push_subscriptions!
  end

  def push_to_streaming_api!
    redis.publish("timeline:#{@recipient.id}:notifications", { event: :notification, payload: InlineRenderer.render(@notification, @recipient, :notification) }.to_json)
  end

  def subscribed_to_streaming_api?
    redis.exists?("subscribed:timeline:#{@recipient.id}") || redis.exists?("subscribed:timeline:#{@recipient.id}:notifications")
  end

  def push_to_conversation!
    AccountConversation.add_status(@recipient, @notification.target_status)
  end

  def direct_message?
    @notification.type == :mention && @notification.target_status.direct_visibility?
  end

  # 대상 글이 DM 인 인용 알림(quote·quoted_update). DM 채팅이 꺼져 있으면 상류 그대로 돈다.
  def direct_quote?
    return false unless Mastodon::DmChat.enabled? && %i(quote quoted_update).include?(@notification.type)

    @notification.target_status&.direct_visibility? || false
  end

  # @_longwhile — DM 채팅이 켜진 인스턴스의 direct 멘션. 꺼져 있으면 상류 그대로 돈다.
  def dm_chat_message?
    Mastodon::DmChat.enabled? && direct_message?
  end

  def push_to_web_push_subscriptions!
    ::Web::PushNotificationWorker.push_bulk(web_push_subscriptions.select { |subscription| subscription.pushable?(@notification) }) { |subscription| [subscription.id, @notification.id] }
  end

  # @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
  #   네이티브 모바일 앱(FCM)에만 푸시를 보낸다. 웹 푸시는 제외한다.
  #   DM 알림은 웹에서는 채팅 배지로만 표시하고, 모바일에서만 푸시로 받는다.
  # @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅의 앱 푸시
  #
  #   **브라우저 구독만 뺀다.** 웹에는 내비 배지와 도착 소리가 있으므로 푸시가 한 번
  #   더 울릴 이유가 없다. 나머지(공식 앱·서드파티)에는 /messages 화면이 없으니
  #   푸시가 DM 을 아는 유일한 통로다.
  #
  #   **한때 여기서 `WebPushRequest#fcm_native?` 로 골랐고, 그것이 아무에게도 푸시가
  #   안 가던 원인이었다.** 그 판정은 엔드포인트가 `https://native-fcm.occm.cc/` 로
  #   시작하는지를 보는데, 그 주소를 등록하는 것은 우리가 따로 빌드한 안드로이드
  #   앱뿐이다. 공식 iOS 는 `apn.joinmastodon.org`, 공식 안드로이드도 표준 웹푸시
  #   엔드포인트를 쓰므로 **하나도 걸리지 않았다.** "네이티브 앱" 을 엔드포인트 모양
  #   으로 판정한 것이 잘못이었다.
  #
  #   판정을 **어느 클라이언트가 등록했는가**로 바꾼다. 이 인스턴스의 웹 UI 는
  #   `db/seeds/01_web_app.rb` 가 만든 `superapp` 앱의 토큰을 쓴다
  #   (`SessionActivation#access_token`). 그것만 빼면 나머지는 전부 앱이다.
  #   앱이 푸시 방식을 바꿔도(FCM ↔ 표준 웹푸시) 여기는 흔들리지 않는다.
  #
  #   실제 전송은 상류 워커가 한다. 엔드포인트 모양에 따라 FCM·레거시·표준을
  #   알아서 가른다(`Web::PushNotificationWorker#perform`).
  def push_to_app_subscriptions!
    targets = web_push_subscriptions.reject { |subscription| browser_subscription?(subscription) }
                                    .select { |subscription| subscription.pushable?(@notification) }

    ::Web::PushNotificationWorker.push_bulk(targets) { |subscription| [subscription.id, @notification.id] }
  end

  # 웹 UI 가 등록한 구독인가.
  #
  # **앱을 못 찾으면 브라우저가 아닌 것으로 본다.** 푸시가 한 번 더 가는 쪽이,
  # 앱에 아무것도 안 가는 쪽보다 낫다 — 방금 고친 것이 뒤엣것이다.
  def browser_subscription?(subscription)
    subscription.access_token&.application&.superapp?
  end

  # `access_token` 과 그 앱을 함께 읽는다. 위의 `browser_subscription?` 가 구독마다
  # 그것을 보므로, 없으면 기기 수만큼 왕복이 는다.
  def web_push_subscriptions
    @web_push_subscriptions ||= ::Web::PushSubscription.where(user_id: @recipient.user.id).includes(access_token: :application).to_a
  end

  def subscribed_to_web_push?
    web_push_subscriptions.any?
  end

  def send_email!
    return unless NotificationMailer.respond_to?(@notification.type)

    NotificationMailer
      .with(recipient: @recipient, notification: @notification)
      .public_send(@notification.type)
      .deliver_later(wait: 2.minutes)
  end

  def email_needed?
    (!recipient_online? || always_send_emails?) && send_email_for_notification_type?
  end

  def recipient_online?
    subscribed_to_streaming_api? || subscribed_to_web_push?
  end

  def always_send_emails?
    @recipient.user.settings.always_send_emails
  end

  def send_email_for_notification_type?
    NON_EMAIL_TYPES.exclude?(@notification.type) && @recipient.user.settings["notification_emails.#{@notification.type}"]
  end
end
