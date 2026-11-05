# frozen_string_literal: true

require 'rails_helper'

RSpec.describe NotifyService do
  subject { described_class.new.call(recipient, type, activity) }

  let(:user) { Fabricate(:user) }
  let(:recipient) { user.account }
  let(:sender) { Fabricate(:account, domain: 'example.com') }
  let(:activity) { Fabricate(:follow, account: sender, target_account: recipient) }
  let(:type) { :follow }

  it { expect { subject }.to change(Notification, :count).by(1) }

  it 'does not notify when sender is blocked' do
    recipient.block!(sender)
    expect { subject }.to_not change(Notification, :count)
  end

  it 'does not notify when sender is muted with hide_notifications' do
    recipient.mute!(sender, notifications: true)
    expect { subject }.to_not change(Notification, :count)
  end

  it 'does notify when sender is muted without hide_notifications' do
    recipient.mute!(sender, notifications: false)
    expect { subject }.to change(Notification, :count)
  end

  it 'does not notify when sender\'s domain is blocked' do
    recipient.block_domain!(sender.domain)
    expect { subject }.to_not change(Notification, :count)
  end

  it 'does still notify when sender\'s domain is blocked but sender is followed' do
    recipient.block_domain!(sender.domain)
    recipient.follow!(sender)
    expect { subject }.to change(Notification, :count)
  end

  it 'does not notify when sender is silenced and not followed' do
    sender.silence!
    subject
    expect(Notification.find_by(activity: activity).filtered?).to be true
  end

  it 'does not notify when recipient is suspended' do
    recipient.suspend!
    expect { subject }.to_not change(Notification, :count)
  end

  it 'does not notify when recipient is deleted' do
    recipient.mark_deleted!
    expect { subject }.to_not change(Notification, :count)
  end

  describe 'reblogs' do
    let(:status)   { Fabricate(:status, account: Fabricate(:account)) }
    let(:activity) { Fabricate(:status, account: sender, reblog: status) }
    let(:type)     { :reblog }

    it 'shows reblogs by default' do
      recipient.follow!(sender)
      expect { subject }.to change(Notification, :count)
    end

    it 'shows reblogs when explicitly enabled' do
      recipient.follow!(sender, reblogs: true)
      expect { subject }.to change(Notification, :count)
    end

    it 'shows reblogs when disabled' do
      recipient.follow!(sender, reblogs: false)
      expect { subject }.to change(Notification, :count)
    end
  end

  # 남의 비공개 글을 부스트한 사람은 원작자가 글을 고칠 때마다 'update' 알림으로 새
  # 본문을 받는다. 원작자가 그 사람을 차단했으면 더는 받으면 안 된다.
  describe 'edit notifications' do
    let(:recipient) { user.account }
    let(:sender) { Fabricate(:account) }
    let(:activity) { Fabricate(:status, account: sender, visibility: :private) }
    let(:type) { :update }

    it 'notifies someone who reblogged the status' do
      expect { subject }.to change(Notification, :count).by(1)
    end

    it 'does not notify someone the author has blocked' do
      sender.block!(recipient)

      expect { subject }.to_not change(Notification, :count)
    end
  end

  context 'with muted and blocked users' do
    let(:asshole)  { Fabricate(:account, username: 'asshole') }
    let(:reply_to) { Fabricate(:status, account: asshole) }
    let(:activity) { Fabricate(:mention, account: recipient, status: Fabricate(:status, account: sender, thread: reply_to)) }
    let(:type)     { :mention }

    it 'does not notify when conversation is muted' do
      recipient.mute_conversation!(activity.status.conversation)
      expect { subject }.to_not change(Notification, :count)
    end

    it 'does not notify when it is a reply to a blocked user' do
      recipient.block!(asshole)
      expect { subject }.to_not change(Notification, :count)
    end
  end

  context 'with sender as recipient' do
    let(:sender) { recipient }

    it 'does not notify when recipient is the sender' do
      expect { subject }.to_not change(Notification, :count)
    end
  end

  describe 'email' do
    before do
      user.settings.update('notification_emails.follow': enabled)
      user.save
    end

    context 'when email notification is enabled' do
      let(:enabled) { true }

      it 'sends email', :inline_jobs do
        emails = capture_emails { subject }

        expect(emails.size)
          .to eq(1)
        expect(emails.first)
          .to have_attributes(
            to: contain_exactly(user.email),
            subject: eq(I18n.t('notification_mailer.follow.subject', name: sender.acct, locale: ApplicationMailer::MAIL_LOCALE))
          )
      end
    end

    context 'when email notification is disabled' do
      let(:enabled) { false }

      it "doesn't send email" do
        emails = capture_emails { subject }

        expect(emails).to be_empty
      end
    end
  end

  context 'when the blocked sender has a role' do
    let(:sender) { Fabricate(:user, role: sender_role).account }
    let(:activity) { Fabricate(:mention, status: Fabricate(:status, account: sender)) }
    let(:type) { :mention }

    before do
      recipient.block!(sender)
    end

    context 'when the role is a visible moderator' do
      let(:sender_role) { Fabricate(:user_role, highlighted: true, permissions: UserRole::FLAGS[:manage_users]) }

      it 'does notify' do
        expect { subject }.to change(Notification, :count)
      end
    end

    context 'when the role is a non-visible moderator' do
      let(:sender_role) { Fabricate(:user_role, highlighted: false, permissions: UserRole::FLAGS[:manage_users]) }

      it 'does not notify' do
        expect { subject }.to_not change(Notification, :count)
      end
    end

    context 'when the role is a visible non-moderator' do
      let(:sender_role) { Fabricate(:user_role, highlighted: true) }

      it 'does not notify' do
        expect { subject }.to_not change(Notification, :count)
      end
    end
  end

  # @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
  #   DM 알림은 만들되 사람이 보는 통로에서만 뺀다. 근거는 DECISIONS.md A-60.
  #   레코드를 아예 만들지 않으면 API 로 도는 자동봇이 통째로 먹통이 된다.
  context 'with a direct message while DM chat is enabled' do
    let(:unknown)  { Fabricate(:account, username: 'unknown') }
    let(:status)   { Fabricate(:status, account: unknown, visibility: :direct) }
    let(:activity) { Fabricate(:mention, account: recipient, status: status) }
    let(:type)     { :mention }

    before do
      allow(Mastodon::DmChat).to receive(:enabled?).and_return(true)
      allow(redis).to receive(:exists?).and_return(true)
      allow(redis).to receive(:publish)
    end

    it 'creates the notification so that automated clients can see it' do
      expect { subject }.to change(Notification, :count).by(1)
    end

    # 필터링은 알림함을 위한 장치인데 DM 은 알림함에 뜨지 않는다. 남겨 두면
    # for_private_mentions 의 기본값(filter) 때문에 봇이 팔로우하지 않은 사람의
    # 명령어가 조용히 사라진다.
    it 'never marks it filtered' do
      Fabricate(:notification_policy, account: recipient, filter_private_mentions: true)

      subject

      expect(Notification.last).to_not be_filtered
    end

    it 'does not raise a notification request' do
      Fabricate(:notification_policy, account: recipient, filter_private_mentions: true)

      expect { subject }.to_not change(NotificationRequest, :count)
    end

    it 'pushes to streaming so that the bot receives it' do
      subject

      expect(redis).to have_received(:publish).with("timeline:#{recipient.id}:notifications", anything)
    end

    it 'updates the legacy conversation list' do
      expect { subject }.to change(AccountConversation, :count).by(1)
    end

    # @_longwhile — 앱 푸시. **브라우저 구독만 뺀다.** 웹에는 배지와 도착 소리가
    #   있고, 앱에는 /messages 화면이 없어 푸시가 유일한 통로다.
    #
    #   **표준 웹푸시 엔드포인트를 쓰는 앱**이 이 스펙의 핵심이다. 한때 여기서
    #   `WebPushRequest#fcm_native?`(엔드포인트가 `native-fcm.occm.cc` 로 시작)로
    #   골랐는데, 공식 iOS·안드로이드는 그 주소를 쓰지 않아 **하나도 안 걸렸고
    #   푸시가 통째로 안 갔다.** 판정을 엔드포인트 모양이 아니라 등록한
    #   클라이언트(Doorkeeper 의 `superapp`)로 바꾼 이유가 그것이다.
    context 'with push subscriptions registered' do
      let(:alerts) { { alerts: { mention: true } } }

      # 앱. 엔드포인트는 평범한 웹푸시 주소이고, 앱은 superapp 이 아니다.
      let!(:app_subscription) do
        Fabricate(:web_push_subscription, user: user, data: alerts)
      end

      # 브라우저. 웹 UI 는 `db/seeds/01_web_app.rb` 가 만든 superapp 의 토큰을 쓴다.
      let!(:browser_subscription) do
        Fabricate(:web_push_subscription,
                  user: user,
                  data: alerts,
                  access_token: Fabricate(:accessible_access_token,
                                          resource_owner_id: user.id,
                                          application: Fabricate(:application, superapp: true)))
      end

      before { allow(Web::PushNotificationWorker).to receive(:push_bulk) }

      it 'pushes to the app and not to the browser' do
        subject

        expect(Web::PushNotificationWorker).to have_received(:push_bulk).with([app_subscription])
      end

      it 'skips subscriptions that turned the mention alert off' do
        browser_subscription.destroy!
        app_subscription.update!(data: { alerts: { mention: false } })

        subject

        expect(Web::PushNotificationWorker).to have_received(:push_bulk).with([])
      end
    end
  end

  # 플래그를 내리면 상류 그대로 돌아와야 되돌리기가 성립한다. (A-60)
  context 'with a direct message while DM chat is disabled' do
    let(:unknown)  { Fabricate(:account, username: 'unknown') }
    let(:status)   { Fabricate(:status, account: unknown, visibility: :direct) }
    let(:activity) { Fabricate(:mention, account: recipient, status: status) }
    let(:type)     { :mention }

    before do
      allow(Mastodon::DmChat).to receive(:enabled?).and_return(false)
      Fabricate(:notification_policy, account: recipient, filter_private_mentions: true)
    end

    it 'filters the private mention as upstream does' do
      subject

      expect(Notification.last).to be_filtered
    end
  end

  # @_longwhile — 공지 글을 인용한 DM 은 멘션과 함께 `quote` 알림도 만든다(4.5). 같은 DM 을
  #   채팅 경로가 이미 알리므로 사람 통로(푸시·메일·알림 요청함·실시간 알림함)로는 내지 않는다.
  context 'with a quote inside a direct message while DM chat is enabled' do
    let(:unknown)  { Fabricate(:account, username: 'unknown') }
    let(:quoted)   { Fabricate(:status, account: recipient, visibility: :unlisted) }
    let(:status)   { Fabricate(:status, account: unknown, visibility: :direct) }
    let(:activity) { Fabricate(:quote, status: status, quoted_status: quoted, state: :accepted) }
    let(:type)     { :quote }

    let!(:subscription) { Fabricate(:web_push_subscription, user: user, data: { alerts: { quote: true } }) }

    before do
      allow(Mastodon::DmChat).to receive(:enabled?).and_return(true)
      allow(redis).to receive(:exists?).and_return(true)
      allow(redis).to receive(:publish)
      allow(Web::PushNotificationWorker).to receive(:push_bulk)
      user.settings.update('notification_emails.quote': true, always_send_emails: true)
      user.save
    end

    it 'keeps the record but sends it through no human channel', :aggregate_failures, :inline_jobs do
      emails = capture_emails { expect { subject }.to change(Notification, :count).by(1) }

      expect(emails).to be_empty
      expect(Web::PushNotificationWorker).to_not have_received(:push_bulk)
      expect(redis).to_not have_received(:publish).with("timeline:#{recipient.id}:notifications", anything)
    end

    it 'does not raise a notification request' do
      Fabricate(:notification_policy, account: recipient, filter_not_following: true)

      expect { subject }.to_not change(NotificationRequest, :count)
      expect(Notification.last).to_not be_filtered
    end

    context 'when the quoting status is not a direct message' do
      let(:status) { Fabricate(:status, account: unknown, visibility: :private) }

      it 'pushes it as usual' do
        subject

        expect(Web::PushNotificationWorker).to have_received(:push_bulk).with([subscription])
      end
    end
  end

  context 'with filtered notifications' do
    let(:unknown)  { Fabricate(:account, username: 'unknown') }
    let(:status)   { Fabricate(:status, account: unknown) }
    let(:activity) { Fabricate(:mention, account: recipient, status: status) }
    let(:type)     { :mention }

    before do
      Fabricate(:notification_policy, account: recipient, filter_not_following: true)
    end

    it 'creates a filtered notification' do
      expect { subject }.to change(Notification, :count)
      expect(Notification.last).to be_filtered
    end

    context 'when no notification request exists' do
      it 'creates a notification request' do
        expect { subject }.to change(NotificationRequest, :count)
      end
    end

    context 'when a notification request exists' do
      let!(:notification_request) do
        Fabricate(:notification_request, account: recipient, from_account: unknown, last_status: Fabricate(:status, account: unknown))
      end

      it 'updates the existing notification request' do
        expect { subject }.to_not change(NotificationRequest, :count)
        expect(notification_request.reload.last_status).to eq status
      end
    end
  end

  describe NotifyService::DropCondition do
    subject { described_class.new(notification) }

    let(:activity) { Fabricate(:mention, status: Fabricate(:status)) }
    let(:notification) { Fabricate(:notification, type: :mention, activity: activity, from_account: activity.status.account, account: activity.account) }

    describe '#drop' do
      context 'when sender is silenced and recipient has a default policy' do
        before do
          notification.from_account.silence!
        end

        it 'returns false' do
          expect(subject.drop?).to be false
        end
      end

      context 'when sender is silenced and recipient has a policy to ignore silenced accounts' do
        before do
          notification.from_account.silence!
          notification.account.create_notification_policy!(for_limited_accounts: :drop)
        end

        it 'returns true' do
          expect(subject.drop?).to be true
        end
      end

      context 'when sender is considered silenced through `silenced` option and recipient has a policy to ignore silenced accounts' do
        subject { described_class.new(notification, silenced: true) }

        before do
          notification.account.create_notification_policy!(for_limited_accounts: :drop)
        end

        it 'returns true' do
          expect(subject.drop?).to be true
        end
      end

      context 'when sender is new and recipient has a default policy' do
        it 'returns false' do
          expect(subject.drop?).to be false
        end
      end

      context 'when sender is new and recipient has a policy to ignore new accounts' do
        before do
          notification.account.create_notification_policy!(for_new_accounts: :drop)
        end

        it 'returns true' do
          expect(subject.drop?).to be true
        end
      end

      context 'when sender is new and followed and recipient has a policy to ignore new accounts' do
        before do
          notification.account.create_notification_policy!(for_new_accounts: :drop)
          notification.account.follow!(notification.from_account)
        end

        it 'returns false' do
          expect(subject.drop?).to be false
        end
      end

      context 'when recipient has blocked sender' do
        before do
          notification.account.block!(notification.from_account)
        end

        it 'returns true' do
          expect(subject.drop?).to be true
        end
      end

      context 'with bot policies' do
        let(:bot_sender) { Fabricate(:account, bot: true) }
        let(:human_sender) { Fabricate(:account, bot: false) }
        let(:original_status) { Fabricate(:status) }
        let(:recipient) { Fabricate(:account) }

        def reblog_notification(from)
          activity = Fabricate(:status, account: from, reblog: original_status)
          Fabricate(:notification, type: :reblog, activity: activity, from_account: from, account: recipient)
        end

        before do
          recipient.create_notification_policy!(
            for_not_following: :accept,
            for_not_followers: :accept,
            for_new_accounts: :accept,
            for_private_mentions: :accept,
            for_limited_accounts: :accept,
            for_bots: bots_policy
          )
        end

        context 'when recipient is dropping bots' do
          let(:bots_policy) { :drop }

          it 'drops bot reblogs' do
            notification = reblog_notification(bot_sender)
            expect(described_class.new(notification).drop?).to be true
          end

          it 'keeps human reblogs' do
            notification = reblog_notification(human_sender)
            expect(described_class.new(notification).drop?).to be false
          end
        end

        context 'when recipient is filtering bots' do
          let(:bots_policy) { :filter }

          it 'does not drop bot reblogs' do
            notification = reblog_notification(bot_sender)
            expect(described_class.new(notification).drop?).to be false
          end
        end

        context 'when recipient is accepting bots' do
          let(:bots_policy) { :accept }

          it 'does not drop bot reblogs' do
            notification = reblog_notification(bot_sender)
            expect(described_class.new(notification).drop?).to be false
          end
        end
      end
    end
  end

  describe NotifyService::FilterCondition do
    subject { described_class.new(notification) }

    let(:activity) { Fabricate(:mention, status: Fabricate(:status)) }
    let(:notification) { Fabricate(:notification, type: :mention, activity: activity, from_account: activity.status.account, account: activity.account) }

    describe '#filter?' do
      context 'when sender is silenced' do
        before do
          notification.from_account.silence!
        end

        it 'returns true' do
          expect(subject.filter?).to be true
        end

        context 'when recipient follows sender' do
          before do
            notification.account.follow!(notification.from_account)
          end

          it 'returns false' do
            expect(subject.filter?).to be false
          end
        end

        context 'when recipient is allowing limited accounts' do
          before do
            notification.account.create_notification_policy!(for_limited_accounts: :accept)
          end

          it 'returns false' do
            expect(subject.filter?).to be false
          end
        end
      end

      context 'when sender is considered silenced through the `silenced` option' do
        subject { described_class.new(notification, silenced: true) }

        it 'returns true' do
          expect(subject.filter?).to be true
        end

        context 'when recipient follows sender' do
          before do
            notification.account.follow!(notification.from_account)
          end

          it 'returns false' do
            expect(subject.filter?).to be false
          end
        end

        context 'when recipient is allowing limited accounts' do
          before do
            notification.account.create_notification_policy!(for_limited_accounts: :accept)
          end

          it 'returns false' do
            expect(subject.filter?).to be false
          end
        end
      end

      context 'when recipient is filtering not-followed senders' do
        before do
          Fabricate(:notification_policy, account: notification.account, filter_not_following: true)
        end

        it 'returns true' do
          expect(subject.filter?).to be true
        end

        context 'when sender has permission' do
          before do
            Fabricate(:notification_permission, account: notification.account, from_account: notification.from_account)
          end

          it 'returns false' do
            expect(subject.filter?).to be false
          end
        end

        context 'when sender is a moderator' do
          let(:sender_role) { Fabricate(:user_role, highlighted: true, permissions: UserRole::FLAGS[:manage_users]) }
          let(:sender) { Fabricate(:user, role: sender_role).account }
          let(:activity) { Fabricate(:mention, status: Fabricate(:status, account: sender)) }

          it 'returns false' do
            expect(subject.filter?).to be false
          end
        end

        context 'when sender is followed by recipient' do
          before do
            notification.account.follow!(notification.from_account)
          end

          it 'returns false' do
            expect(subject.filter?).to be false
          end
        end
      end

      context 'when recipient is filtering not-followers' do
        before do
          Fabricate(:notification_policy, account: notification.account, filter_not_followers: true)
        end

        it 'returns true' do
          expect(subject.filter?).to be true
        end

        context 'when sender has permission' do
          before do
            Fabricate(:notification_permission, account: notification.account, from_account: notification.from_account)
          end

          it 'returns false' do
            expect(subject.filter?).to be false
          end
        end

        context 'when sender follows recipient' do
          before do
            notification.from_account.follow!(notification.account)
          end

          it 'returns true' do
            expect(subject.filter?).to be true
          end
        end

        context 'when sender follows recipient for longer than 3 days' do
          before do
            follow = notification.from_account.follow!(notification.account)
            follow.update(created_at: 4.days.ago)
          end

          it 'returns false' do
            expect(subject.filter?).to be false
          end
        end
      end

      context 'when recipient is filtering new accounts' do
        before do
          Fabricate(:notification_policy, account: notification.account, filter_new_accounts: true)
        end

        it 'returns true' do
          expect(subject.filter?).to be true
        end

        context 'when sender has permission' do
          before do
            Fabricate(:notification_permission, account: notification.account, from_account: notification.from_account)
          end

          it 'returns false' do
            expect(subject.filter?).to be false
          end
        end

        context 'when sender is older than 30 days' do
          before do
            notification.from_account.update(created_at: 31.days.ago)
          end

          it 'returns false' do
            expect(subject.filter?).to be false
          end
        end
      end

      context 'when recipient is not filtering anyone' do
        before do
          Fabricate(:notification_policy, account: notification.account)
        end

        it 'returns false' do
          expect(subject.filter?).to be false
        end
      end

      context 'when recipient is filtering unsolicited private mentions' do
        before do
          Fabricate(:notification_policy, account: notification.account, filter_private_mentions: true)
        end

        context 'when notification is not a private mention' do
          it 'returns false' do
            expect(subject.filter?).to be false
          end
        end

        context 'when notification is a private mention' do
          before do
            notification.target_status.update(visibility: :direct)
          end

          it 'returns true' do
            expect(subject.filter?).to be true
          end

          context 'when the message chain is initiated by recipient, but sender is not mentioned' do
            before do
              original_status = Fabricate(:status, account: notification.account, visibility: :direct)
              notification.target_status.update(thread: original_status)
            end

            it 'returns true' do
              expect(subject.filter?).to be true
            end
          end

          context 'when the message chain is initiated by recipient, and sender is mentioned' do
            before do
              original_status = Fabricate(:status, account: notification.account, visibility: :direct)
              notification.target_status.update(thread: original_status)
              Fabricate(:mention, status: original_status, account: notification.from_account)
            end

            it 'returns false' do
              expect(subject.filter?).to be false
            end
          end

          context 'when the sender is mentioned in an unrelated message chain' do
            before do
              original_status = Fabricate(:status, visibility: :direct)
              intermediary_status = Fabricate(:status, visibility: :direct, thread: original_status)
              notification.target_status.update(thread: intermediary_status)
              Fabricate(:mention, status: original_status, account: notification.from_account)
            end

            it 'returns true' do
              expect(subject.filter?).to be true
            end
          end
        end
      end

      context 'with bot policies' do
        let(:bot_sender) { Fabricate(:account, bot: true) }
        let(:human_sender) { Fabricate(:account, bot: false) }
        let(:original_status) { Fabricate(:status) }
        let(:recipient) { Fabricate(:account) }

        def reblog_notification(from)
          activity = Fabricate(:status, account: from, reblog: original_status)
          Fabricate(:notification, type: :reblog, activity: activity, from_account: from, account: recipient)
        end

        before do
          recipient.create_notification_policy!(
            for_not_following: :accept,
            for_not_followers: :accept,
            for_new_accounts: :accept,
            for_private_mentions: :accept,
            for_limited_accounts: :accept,
            for_bots: bots_policy
          )
        end

        context 'when recipient is dropping bots' do
          let(:bots_policy) { :drop }

          it 'does not filter bot reblogs' do
            notification = reblog_notification(bot_sender)
            expect(described_class.new(notification).filter?).to be false
          end
        end

        context 'when recipient is filtering bots' do
          let(:bots_policy) { :filter }

          it 'filters bot reblogs' do
            notification = reblog_notification(bot_sender)
            expect(described_class.new(notification).filter?).to be true
          end

          it 'keeps human reblogs' do
            notification = reblog_notification(human_sender)
            expect(described_class.new(notification).filter?).to be false
          end
        end

        context 'when recipient is accepting bots' do
          let(:bots_policy) { :accept }

          it 'does not filter bot reblogs' do
            notification = reblog_notification(bot_sender)
            expect(described_class.new(notification).filter?).to be false
          end
        end
      end
    end
  end
end
