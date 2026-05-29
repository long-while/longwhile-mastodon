# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Settings Profiles' do
  describe 'PUT /settings/profile' do
    let(:user) { Fabricate(:user) }

    before { sign_in user }

    it 'gracefully handles invalid nested params' do
      put settings_profile_path(account: 'invalid')

      expect(response)
        .to have_http_status(400)
    end

    context 'when toggling the private account setting' do
      it 'unlocks an account whose locked flag is out of sync with default_privacy' do
        user.account.update!(locked: true)

        put settings_profile_path, params: { account: { private_account: '0' } }

        expect(user.account.reload).to_not be_locked
      end

      it 'locks the account when toggled on' do
        user.account.update!(locked: false)

        put settings_profile_path, params: { account: { private_account: '1' } }

        expect(user.account.reload).to be_locked
      end
    end
  end
end
