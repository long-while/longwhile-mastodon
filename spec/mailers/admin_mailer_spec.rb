# frozen_string_literal: true

require 'rails_helper'

RSpec.describe AdminMailer do
  around { |example| I18n.with_locale(:ko) { example.run } }

  describe '.new_report' do
    let(:sender)    { Fabricate(:account, username: 'John') }
    let(:recipient) { Fabricate(:account, username: 'Mike') }
    let(:report)    { Fabricate(:report, account: sender, target_account: recipient) }
    let(:mail)      { described_class.with(recipient: recipient).new_report(report) }

    before do
      recipient.user.update(locale: :en)
    end

    it 'renders the email' do
      expect { mail.deliver }
        .to send_email(
          to: recipient.user_email,
          from: 'notifications@localhost',
          subject: I18n.t('admin_mailer.new_report.subject', instance: Rails.configuration.x.local_domain, id: report.id)
        )
      expect(mail.body)
        .to match(I18n.t('application_mailer.salutation', name: 'Mike'))
        .and match(I18n.t('admin_mailer.new_report.body', reporter: 'John', target: 'Mike'))
        .and match("#{I18n.t('application_mailer.view')} #{admin_report_url(report)}")
    end
  end

  describe '.new_appeal' do
    let(:appeal) { Fabricate(:appeal) }
    let(:recipient) { Fabricate(:account, username: 'Kurt') }
    let(:mail)      { described_class.with(recipient: recipient).new_appeal(appeal) }

    before do
      recipient.user.update(locale: :en)
    end

    it 'renders the email' do
      expect { mail.deliver }
        .to send_email(
          to: recipient.user_email,
          from: 'notifications@localhost',
          subject: I18n.t('admin_mailer.new_appeal.subject', instance: Rails.configuration.x.local_domain, username: appeal.account.username)
        )
      expect(mail.body)
        .to match("#{appeal.account.username} 님이 #{appeal.strike.account.username} 님에 의해")
    end
  end

  describe '.new_pending_account' do
    let(:recipient) { Fabricate(:account, username: 'Barklums') }
    let(:user) { Fabricate(:user) }
    let(:mail) { described_class.with(recipient: recipient).new_pending_account(user) }

    before do
      recipient.user.update(locale: :en)
    end

    it 'renders the email' do
      expect { mail.deliver }
        .to send_email(
          to: recipient.user_email,
          from: 'notifications@localhost',
          subject: I18n.t('admin_mailer.new_pending_account.subject', instance: Rails.configuration.x.local_domain, username: user.account.username)
        )
      expect(mail.body)
        .to match(I18n.t('admin_mailer.new_pending_account.body'))
    end
  end

  describe '.new_software_updates' do
    let(:recipient) { Fabricate(:account, username: 'Bob') }
    let(:mail) { described_class.with(recipient: recipient).new_software_updates }

    before do
      recipient.user.update(locale: :en)
    end

    it 'renders the email' do
      expect { mail.deliver }
        .to send_email(
          to: recipient.user_email,
          from: 'notifications@localhost',
          subject: I18n.t('admin_mailer.new_software_updates.subject', instance: Rails.configuration.x.local_domain)
        )
      expect(mail.body)
        .to match(I18n.t('admin_mailer.new_software_updates.body'))
    end
  end

  describe '.new_critical_software_updates' do
    let(:recipient) { Fabricate(:account, username: 'Bob') }
    let(:mail) { described_class.with(recipient: recipient).new_critical_software_updates }

    before do
      recipient.user.update(locale: :en)
    end

    it 'renders the email' do
      expect { mail.deliver }
        .to send_email(
          to: recipient.user_email,
          from: 'notifications@localhost',
          subject: I18n.t('admin_mailer.new_critical_software_updates.subject', instance: Rails.configuration.x.local_domain)
        )
      expect(mail.body)
        .to match(I18n.t('admin_mailer.new_critical_software_updates.body'))
      expect(mail)
        .to have_header('Importance', 'high')
        .and have_header('Priority', 'urgent')
        .and have_header('X-Priority', '1')
    end
  end

  describe '.auto_close_registrations' do
    let(:recipient) { Fabricate(:account, username: 'Bob') }
    let(:mail) { described_class.with(recipient: recipient).auto_close_registrations }

    before do
      recipient.user.update(locale: :en)
    end

    it 'renders the email' do
      expect { mail.deliver }
        .to send_email(
          to: recipient.user_email,
          from: 'notifications@localhost',
          subject: I18n.t('admin_mailer.auto_close_registrations.subject', instance: Rails.configuration.x.local_domain)
        )
      expect(mail.body)
        .to match('자동으로 변경되었습니다')
    end
  end
end
