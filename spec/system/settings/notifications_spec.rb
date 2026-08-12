# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Settings notifications page' do
  let(:user) { Fabricate :user }

  before { sign_in user }

  it 'Views and updates user prefs' do
    visit settings_notifications_path

    expect(page)
      .to have_private_cache_control

    uncheck notifications_follow_field

    expect { click_on submit_button }
      .to change { user.reload.settings['notification_emails.follow'] }.to(false)
    expect(page)
      .to have_title(I18n.t('settings.notifications'))
  end

  it 'Saves the notification policy from the same form' do
    visit settings_notifications_path

    select I18n.t('simple_form.labels.notification_policy.policies.drop'), from: not_following_field

    expect { click_on submit_button }
      .to change { NotificationPolicy.find_by(account: user.account)&.for_not_following }.to('drop')
  end

  def notifications_follow_field
    form_label('notification_emails.follow')
  end

  def not_following_field
    I18n.t('simple_form.labels.notification_policy.for_not_following')
  end
end
