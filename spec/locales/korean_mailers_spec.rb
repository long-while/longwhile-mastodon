# frozen_string_literal: true

require 'rails_helper'

# @_longwhile — 메일은 화면과 달리 Localized 의 :ko 고정을 받지 않고 받는 사람의
# user.locale 을 따른다(대부분 Sidekiq 에서 만들어진다). 상류 ko.yml 에 키가 빠지면
# 운영 설정의 i18n.fallbacks 가 [:en] 이라 그 부분만 조용히 영어가 된다 — 4.7 의
# 지원 종료 안내 메일이 그랬다. 한국어 사용자에게 가는 메일을 전부 만들어 보고
# 제목·본문에 영어 원문이나 "translation missing" 이 없는지 본다.
RSpec.describe 'I18n' do
  describe 'Mails to Korean users' do
    RSpec::Matchers.define_negated_matcher :not_match, :match

    let(:receiver) { Fabricate(:user, locale: 'ko') }
    let(:ip) { '192.168.0.1' }
    let(:agent) { 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0' }
    let(:credential) { WebauthnCredential.new(nickname: 'USB Key') }

    # 제목은 영어 원문의 가장 긴 고정 구절이 들어 있지 않은지로 본다(사이트 이름 등 끼워
    # 넣는 값이 한글이어도 속지 않게).
    def expect_korean(mail, key)
      english = I18n.t(key, locale: :en)
      english_phrases = Array.wrap(english.is_a?(Hash) ? english.values : english).map { |text| text.split(/%\{\w+\}/).map(&:strip).max_by(&:length) }
      bodies = mail.parts.presence&.map { |part| part.body.decoded } || [mail.body.decoded]

      expect(mail.subject).to match(/\p{Hangul}/)
      expect(english_phrases).to all(satisfy { |phrase| mail.subject.exclude?(phrase) })
      expect(bodies).to all(match(/\p{Hangul}/).and(not_match(/translation[ _]missing/i)))
    end

    describe UserMailer do
      {
        confirmation_instructions: ->(user) { [user, 'spec'] },
        reset_password_instructions: ->(user) { [user, 'spec'] },
        password_change: ->(user) { [user] },
        email_changed: ->(user) { [user.tap { |u| u.unconfirmed_email = 'new@example.com' }] },
        two_factor_enabled: ->(user) { [user] },
        two_factor_disabled: ->(user) { [user] },
        two_factor_recovery_codes_changed: ->(user) { [user] },
        webauthn_enabled: ->(user) { [user] },
        webauthn_disabled: ->(user) { [user] },
        webauthn_credential_added: ->(user) { [user, credential] },
        webauthn_credential_deleted: ->(user) { [user, credential] },
        welcome: ->(user) { [user] },
        backup_ready: ->(user) { [user, Fabricate(:backup, user: user)] },
        warning: ->(user) { [user, Fabricate(:account_warning, target_account: user.account, text: '안내')] },
        appeal_approved: ->(user) { [user, Fabricate(:appeal, account: user.account, approved_at: Time.now.utc)] },
        appeal_rejected: ->(user) { [user, Fabricate(:appeal, account: user.account, rejected_at: Time.now.utc)] },
        suspicious_sign_in: ->(user) { [user, ip, agent, Time.now.utc] },
        failed_2fa: ->(user) { [user, ip, agent, Time.now.utc] },
        terms_of_service_changed: ->(user) { [user, Fabricate(:terms_of_service)] },
        announcement_published: ->(user) { [user, Fabricate(:announcement)] },
        sign_in_token: ->(user) { [user.tap(&:generate_sign_in_token), ip, agent, Time.now.utc] },
      }.each do |action, args|
        it "writes #{action} in Korean" do
          mail = described_class.public_send(action, *instance_exec(receiver, &args))

          expect_korean(mail, "user_mailer.#{action}.subject")
        end
      end
    end

    describe AdminMailer do
      let(:recipient) { receiver.account }

      before do
        Fabricate(:software_update, version: '99.0.0', urgent: true)
        allow(SoftwareDeprecation).to receive(:current_branch).and_return('4.7')
      end

      {
        new_report: -> { [Fabricate(:report)] },
        new_appeal: -> { [Fabricate(:appeal)] },
        new_pending_account: -> { [Fabricate(:user, approved: false)] },
        new_software_updates: -> { [] },
        new_critical_software_updates: -> { [] },
        end_of_support_three_months_warning: -> { [] },
        end_of_support_two_weeks_warning: -> { [] },
        end_of_support_out_of_support_warning: -> { [] },
        auto_close_registrations: -> { [] },
      }.each do |action, args|
        it "writes #{action} in Korean" do
          mail = described_class.with(recipient: recipient).public_send(action, *instance_exec(&args))

          expect_korean(mail, "admin_mailer.#{action}.subject")
        end
      end
    end

    # 64627430fe 부터 웹 가입자가 en 으로, tootctl·API 가입자는 빈 값으로 저장돼 있다.
    # 저장된 값과 무관하게 한국어로 간다(ApplicationMailer::MAIL_LOCALE).
    describe 'whatever locale the receiver has stored' do
      [nil, 'en', 'de'].each do |stored|
        it "writes the sign-in code mail in Korean for locale #{stored.inspect}" do
          receiver.update!(locale: stored)
          mail = UserMailer.sign_in_token(receiver.tap(&:generate_sign_in_token), ip, agent, Time.now.utc)

          expect_korean(mail, 'user_mailer.sign_in_token.subject')
        end

        it "writes notification mails in Korean for locale #{stored.inspect}" do
          receiver.update!(locale: stored)
          follow = Fabricate(:follow, target_account: receiver.account)
          notification = Notification.create!(account: receiver.account, activity: follow)
          mail = NotificationMailer.with(recipient: receiver.account, notification: notification).follow

          expect_korean(mail, 'notification_mailer.follow.subject')
        end
      end
    end
  end
end
