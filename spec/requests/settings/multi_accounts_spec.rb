# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Settings Multi Accounts' do
  let(:user) { Fabricate(:user) }
  let!(:own_token) do
    Fabricate(:access_token, resource_owner_id: user.id, multi_account: true, purpose: 'multi_account_refresh', long_lived: true, last_used_ip: '192.0.2.1')
  end
  let!(:other_users_token) do
    Fabricate(:access_token, multi_account: true, purpose: 'multi_account_refresh', long_lived: true, last_used_ip: '198.51.100.7')
  end
  let!(:web_token) { Fabricate(:access_token, resource_owner_id: user.id, last_used_ip: '203.0.113.9') }

  before { sign_in(user) }

  describe 'GET /settings/multi_accounts' do
    it 'lists only the long-lived switching tokens of the current user' do
      get settings_multi_accounts_path

      expect(response).to have_http_status(200)
      expect(response.body).to include('192.0.2.1')
      expect(response.body).to_not include('198.51.100.7')
      expect(response.body).to_not include('203.0.113.9')
    end

    it 'hides revoked tokens' do
      own_token.revoke

      get settings_multi_accounts_path

      expect(response.body).to_not include('192.0.2.1')
      expect(response.body).to include(I18n.t('multi_accounts.empty', locale: :ko))
    end
  end

  describe 'DELETE /settings/multi_accounts/:id' do
    it 'revokes the token' do
      delete settings_multi_account_path(own_token)

      expect(response).to redirect_to(settings_multi_accounts_path)
      expect(own_token.reload.revoked_at).to be_present
    end

    it 'returns 404 for a token of another user' do
      delete settings_multi_account_path(other_users_token)

      expect(response).to have_http_status(404)
      expect(other_users_token.reload.revoked_at).to be_nil
    end

    it 'returns 404 for a token that is not a switching token' do
      delete settings_multi_account_path(web_token)

      expect(response).to have_http_status(404)
      expect(web_token.reload.revoked_at).to be_nil
    end
  end

  describe 'DELETE /settings/multi_accounts/destroy_all' do
    it 'revokes every switching token of the user and keeps other tokens' do
      second = Fabricate(:access_token, resource_owner_id: user.id, multi_account: true, purpose: 'multi_account_refresh', long_lived: true)

      delete destroy_all_settings_multi_accounts_path

      expect(response).to redirect_to(settings_multi_accounts_path)
      expect([own_token, second].map { |t| t.reload.revoked_at }).to all(be_present)
      expect(web_token.reload.revoked_at).to be_nil
      expect(other_users_token.reload.revoked_at).to be_nil
    end
  end
end
