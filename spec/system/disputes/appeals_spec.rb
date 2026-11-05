# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Dispute Appeals' do
  let(:user) { Fabricate(:user) }
  # 이 포크는 알림 메일을 모두 꺼 둔 채로 시작한다(UserSettings 의 notification_emails 기본값).
  # 소명 알림을 켠 운영진에게 메일이 가는지를 본다.
  let!(:admin) do
    Fabricate(:admin_user).tap do |admin|
      admin.settings.update('notification_emails.appeal': true)
      admin.save!
    end
  end

  before { sign_in user }

  describe 'Submitting an appeal', :inline_jobs do
    let(:strike) { Fabricate(:account_warning, target_account: user.account) }

    it 'Submits the appeal and notifies admins' do
      visit disputes_strike_path(strike)

      # Invalid with missing attribute
      fill_in 'appeal_text', with: ''
      emails = capture_emails do
        expect { submit_form }
          .to_not change(Appeal, :count)
      end
      expect(emails)
        .to be_empty
      expect(page)
        .to have_text(I18n.t('errors.messages.blank', attribute: '')) # 화면은 한국어 고정(Localized#requested_locale)

      # Valid with text
      fill_in 'appeal_text', with: 'It wasnt me this time!'
      expect { submit_form }
        .to change(Appeal, :count).by(1)
        .and send_email(to: admin.email, subject: new_appeal_subject)
      expect(page)
        .to have_text(I18n.t('disputes.strikes.appealed_msg'))
    end

    def new_appeal_subject
      # 메일은 화면과 달리 받는 사람의 로캘(없으면 기본 로캘)로 나간다.
      I18n.t('admin_mailer.new_appeal.subject', username: user.account.acct, instance: Rails.configuration.x.local_domain, locale: ApplicationMailer::MAIL_LOCALE)
    end

    def submit_form
      click_on I18n.t('disputes.strikes.appeals.submit')
    end
  end
end
