# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Auth Passwords' do
  describe 'GET /auth/password/edit' do
    context 'with invalid reset_password_token' do
      it 'redirects to #new' do
        get edit_user_password_path, params: { reset_password_token: 'some_invalid_value' }

        expect(response)
          .to redirect_to new_user_password_path
      end
    end
  end

  describe 'PUT /auth/password' do
    let(:user) { Fabricate(:user) }
    let(:password) { 'reset0password' }

    context 'with invalid reset_password_token' do
      it 'renders reset password and retains password' do
        put user_password_path, params: { user: { password: password, password_confirmation: password, reset_password_token: 'some_invalid_value' } }

        expect(response.body)
          .to include(I18n.t('auth.set_new_password', locale: :ko))

        expect(User.find(user.id))
          .to be_present
          .and be_valid_password(user.password)
      end
    end

    context 'with a valid reset_password_token' do
      let!(:long_lived_refresh_token) do
        Fabricate(:access_token, resource_owner_id: user.id, multi_account: true, purpose: 'multi_account_refresh', long_lived: true)
      end
      let!(:web_token) { Fabricate(:access_token, resource_owner_id: user.id) }

      it 'changes the password and revokes every token, including long-lived multi-account tokens' do
        raw_token = user.send(:set_reset_password_token)

        put user_password_path, params: { user: { password: password, password_confirmation: password, reset_password_token: raw_token } }

        expect(User.find(user.id)).to be_valid_password(password)
        expect(long_lived_refresh_token.reload.revoked_at).to be_present
        expect(web_token.reload.revoked_at).to be_present
      end
    end
  end
end
