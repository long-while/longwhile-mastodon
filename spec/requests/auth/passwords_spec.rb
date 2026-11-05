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

        # 화면 언어는 한국어로 고정돼 있다(Localized#requested_locale).
        expect(response.body)
          .to include(I18n.t('auth.set_new_password', locale: :ko))

        expect(User.find(user.id))
          .to be_present
          .and be_valid_password(user.password)
      end
    end
  end
end
