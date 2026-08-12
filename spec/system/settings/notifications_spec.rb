# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Settings notifications page' do
  let(:user) { Fabricate :user }

  before { sign_in user }

  it 'Views the page' do
    visit settings_notifications_path

    expect(page)
      .to have_private_cache_control
      .and have_title(I18n.t('settings.notifications'))
  end

  it 'Saves the notification policy even though the form has no user fields' do
    visit settings_notifications_path

    select I18n.t('simple_form.labels.notification_policy.policies.drop'), from: not_following_field

    expect { click_on submit_button }
      .to change { NotificationPolicy.find_by(account: user.account)&.for_not_following }.to('drop')
    expect(page)
      .to have_title(I18n.t('settings.notifications'))
  end

  def not_following_field
    I18n.t('simple_form.labels.notification_policy.for_not_following')
  end
end
