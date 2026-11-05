# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Preferences' do
  let(:user) { Fabricate(:user) }

  before { sign_in user }

  describe 'old addresses' do
    it 'redirects to the new screens' do
      get '/settings/preferences'
      expect(response).to redirect_to('/settings/display')

      get '/settings/preferences/appearance'
      expect(response).to redirect_to('/settings/display')

      get '/settings/preferences/notifications'
      expect(response).to redirect_to('/settings/notifications')
    end
  end

  describe '/settings/display' do
    it 'renders' do
      get '/settings/display'

      expect(response).to have_http_status(200)
    end

    it 'saves the theme and web settings, then comes back to the same screen' do
      put '/settings/display', params: {
        user: {
          time_zone: 'Asia/Seoul',
          settings_attributes: { theme: 'mastodon-bird-ui-dark', 'web.reduce_motion': '1', 'web.advanced_layout': '1' },
        },
      }

      expect(response).to redirect_to('/settings/display')
      user.reload
      expect(user.time_zone).to eq 'Asia/Seoul'
      expect(user.setting_theme).to eq 'mastodon-bird-ui-dark'
      expect(user.setting_reduce_motion).to be true
      expect(user.setting_advanced_layout).to be true
    end
  end

  describe '/settings/notifications' do
    it 'renders' do
      get '/settings/notifications'

      expect(response).to have_http_status(200)
    end

    it 'saves the notification policy even though the form has no user fields for a regular user' do
      put '/settings/notifications', params: { notification_policy: { for_not_following: 'filter', for_not_followers: 'drop', for_new_accounts: 'accept' } }

      expect(response).to redirect_to('/settings/notifications')
      policy = NotificationPolicy.find_by(account: user.account)
      expect(policy).to have_attributes(for_not_following: 'filter', for_not_followers: 'drop', for_new_accounts: 'accept')
    end

    it 'ignores a policy value it does not know' do
      put '/settings/notifications', params: { notification_policy: { for_not_following: 'everything' } }

      expect(response).to redirect_to('/settings/notifications')
      expect(NotificationPolicy.find_or_initialize_by(account: user.account).for_not_following).to eq 'accept'
    end

    it 'saves admin mail settings on the same form' do
      admin = Fabricate(:admin_user)
      sign_in admin

      put '/settings/notifications', params: { user: { settings_attributes: { 'notification_emails.report': '0' } } }

      expect(response).to redirect_to('/settings/notifications')
      expect(admin.reload.settings['notification_emails.report']).to be false
    end
  end
end
