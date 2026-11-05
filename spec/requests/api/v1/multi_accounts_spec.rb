# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Api::V1::MultiAccountsController', type: :request do
  describe 'POST /api/v1/multi_accounts/consume' do
    let(:user) { Fabricate(:user) }
    let(:application) do
      Doorkeeper::Application.create!(
        name: 'MultiAccount',
        redirect_uri: 'https://example.com/callback'
      )
    end
    let(:access_token) do
      Fabricate(
        :access_token,
        application: application,
        resource_owner_id: user.id,
        multi_account: false,
        purpose: nil,
        long_lived: false
      )
    end
    let(:token_response) { instance_double(Doorkeeper::OAuth::TokenResponse, token: access_token, status: :ok) }
    let(:authorization_request) { instance_double(Doorkeeper::OAuth::AuthorizationCodeRequest, authorize: token_response) }
    let(:grant) { instance_double(Doorkeeper::AccessGrant, application_id: application.id) }

    before do
      @original_multi_account_config = Rails.configuration.x.multi_account.dup
      Rails.configuration.x.multi_account[:client_id] = application.uid
      Rails.configuration.x.multi_account[:redirect_uri] = application.redirect_uri

      allow(MultiAccounts::StateStore).to receive(:consume!).and_return({})
      allow(Doorkeeper::Application).to receive(:find_by).and_return(application)
      allow(Doorkeeper::OAuth::Client).to receive(:new).and_return(instance_double(Doorkeeper::OAuth::Client))
      allow(Doorkeeper::OAuth::AuthorizationCodeRequest).to receive(:new).and_return(authorization_request)
      allow(Doorkeeper.config.access_grant_model).to receive(:by_token).and_return(grant)
    end

    after do
      Rails.configuration.x.multi_account = ActiveSupport::HashWithIndifferentAccess.new(@original_multi_account_config)
    end

    let(:payload) do
      {
        payload: {
          state: 'test-state',
          nonce: 'nonce',
          authorization_code: 'code'
        }
      }
    end

    context 'when refresh flow is enabled' do
      before do
        allow(MultiAccountConfig).to receive(:retain_tokens?).and_call_original
        allow(MultiAccountConfig).to receive(:refresh_flow_enabled?).and_return(true)
      end

      it 'marks the token as long-lived multi-account refresh' do
        post '/api/v1/multi_accounts/consume', params: payload

        expect(response).to have_http_status(:ok)
        access_token.reload
        expect(access_token.multi_account).to be(true)
        expect(access_token.long_lived).to be(true)
        expect(access_token.purpose).to eq('multi_account_refresh')
      end
    end

    context 'when refresh flow is disabled' do
      before do
        allow(MultiAccountConfig).to receive(:retain_tokens?).and_call_original
        allow(MultiAccountConfig).to receive(:refresh_flow_enabled?).and_return(false)
      end

      it 'marks the token as a standard multi-account token' do
        post '/api/v1/multi_accounts/consume', params: payload

        expect(response).to have_http_status(:ok)
        access_token.reload
        expect(access_token.multi_account).to be(true)
        expect(access_token.long_lived).to be(false)
        expect(access_token.purpose).to be_nil
      end
    end
  end

  describe 'POST /api/v1/multi_accounts/session/refresh' do
    let(:user) { Fabricate(:user) }
    let(:access_token) { Fabricate(:access_token, resource_owner_id: user.id, multi_account: true) }
    let(:result) { MultiAccounts::RefreshService::Result.new(access_token: access_token, account: user.account, user: user) }
    let(:service_instance) { instance_double(MultiAccounts::RefreshService, call: result) }

    before do
      allow(MultiAccountConfig).to receive(:refresh_flow_enabled?).and_return(true)
      allow(MultiAccounts::RefreshService).to receive(:new).and_return(service_instance)
    end

    it 'returns refreshed token payload' do
      post '/api/v1/multi_accounts/session/refresh', params: { refresh_token: 'refresh-token' }

      expect(MultiAccounts::RefreshService).to have_received(:new).with(
        refresh_token: 'refresh-token',
        request: kind_of(ActionDispatch::Request)
      )
      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body['token']).to eq(access_token.token)
      expect(body['scope']).to eq(access_token.scopes.to_s)
      expect(body['account']['id']).to eq(user.account.id.to_s)
    end

    context 'when refresh flow is disabled' do
      before do
        allow(MultiAccountConfig).to receive(:refresh_flow_enabled?).and_return(false)
      end

      it 'returns forbidden' do
        post '/api/v1/multi_accounts/session/refresh', params: { refresh_token: 'refresh-token' }

        expect(response).to have_http_status(:forbidden)
        expect(MultiAccounts::RefreshService).not_to have_received(:new)
      end
    end

    context 'when service raises an error' do
      let(:service_error) { MultiAccounts::RefreshService::Error.new('invalid', status: 401) }

      before do
        allow(service_instance).to receive(:call).and_raise(service_error)
      end

      it 'returns error response with appropriate status' do
        post '/api/v1/multi_accounts/session/refresh', params: { refresh_token: 'refresh-token' }

        expect(response).to have_http_status(:unauthorized)
        expect(JSON.parse(response.body)['error']).to eq('invalid')
      end
    end

    context 'when refresh_token is missing' do
      it 'returns bad request' do
        post '/api/v1/multi_accounts/session/refresh', params: {}

        expect(response).to have_http_status(:bad_request)
        expect(JSON.parse(response.body)['error']).to include('refresh_token')
      end
    end
  end

  describe 'POST /api/v1/multi_accounts/session/refresh with a stored refresh token' do
    let(:user) { Fabricate(:user) }
    let(:multi_account_app) { Doorkeeper::Application.create!(name: 'MultiAccount', redirect_uri: 'https://example.com/callback', scopes: 'read write follow') }
    let(:refresh_token) do
      Fabricate(:access_token, application: multi_account_app, resource_owner_id: user.id, scopes: 'read write follow',
                               expires_in: 10.years.to_i, multi_account: true, purpose: 'multi_account_refresh', long_lived: true)
    end

    before { allow(MultiAccountConfig).to receive(:refresh_flow_enabled?).and_return(true) }

    it 'hands out a session token that expires shortly' do
      post '/api/v1/multi_accounts/session/refresh', params: { refresh_token: refresh_token.token }

      expect(response).to have_http_status(200)

      session_token = Doorkeeper::AccessToken.find_by(token: response.parsed_body[:token])

      expect(session_token.expires_in).to be_present
      expect(session_token.expires_in).to be <= 1.hour.to_i
      expect(response.parsed_body[:expires_at]).to be_present

      travel_to(2.hours.from_now) do
        get '/api/v1/accounts/verify_credentials', headers: { 'Authorization' => "Bearer #{session_token.token}" }

        expect(response).to have_http_status(401)
      end
    end

    context 'when the account has not signed in for a long time' do
      before do
        user.update!(current_sign_in_at: 7.months.ago)
        allow(UserMailer).to receive(:sign_in_token)
      end

      it 'switches without a security code challenge' do
        post '/api/v1/multi_accounts/session/refresh', params: { refresh_token: refresh_token.token }

        expect(response).to have_http_status(200)
        expect(UserMailer).to_not have_received(:sign_in_token)
        expect(user.reload.sign_in_token).to be_nil
      end
    end
  end

  describe 'POST /api/v1/multi_accounts/refresh_token' do
    let(:user) { Fabricate(:user) }

    let!(:multi_account_app) do
      Doorkeeper::Application.create!(
        name: 'MultiAccount',
        redirect_uri: 'https://example.com/callback',
        scopes: 'read write follow push'
      )
    end

    let!(:web_app) do
      Doorkeeper::Application.create!(
        name: 'Web',
        redirect_uri: 'https://example.com/web',
        scopes: 'read write follow push',
        superapp: true
      )
    end

    let(:session_token) do
      Fabricate(:access_token, application: web_app, resource_owner_id: user.id, scopes: 'read write follow')
    end

    let(:headers) { { 'Authorization' => "Bearer #{session_token.token}" } }

    def long_lived_tokens
      Doorkeeper::AccessToken.long_lived_refresh.not_revoked.where(resource_owner_id: user.id)
    end

    before do
      @original_multi_account_config = Rails.configuration.x.multi_account.dup
      Rails.configuration.x.multi_account[:client_id] = multi_account_app.uid
    end

    after do
      Rails.configuration.x.multi_account = ActiveSupport::HashWithIndifferentAccess.new(@original_multi_account_config)
    end

    context 'without any authentication' do
      it 'returns 401 and mints nothing' do
        post '/api/v1/multi_accounts/refresh_token'

        expect(response).to have_http_status(401)
        expect(long_lived_tokens).to be_empty
      end
    end

    context 'with a third-party application token' do
      let(:third_party_token) do
        Fabricate(:access_token, application: Fabricate(:application), resource_owner_id: user.id, scopes: 'read')
      end

      it 'refuses to mint a long-lived token' do
        post '/api/v1/multi_accounts/refresh_token', headers: { 'Authorization' => "Bearer #{third_party_token.token}" }

        expect(response).to have_http_status(403)
        expect(long_lived_tokens).to be_empty
      end
    end

    context 'with the web interface session token' do
      it 'mints a token the switcher can actually use' do
        post '/api/v1/multi_accounts/refresh_token', headers: headers

        expect(response).to have_http_status(200)

        minted = Doorkeeper::AccessToken.find_by(token: response.parsed_body[:token])

        expect(minted).to have_attributes(
          application_id: multi_account_app.id,
          resource_owner_id: user.id,
          multi_account: true,
          long_lived: true,
          purpose: 'multi_account_refresh'
        )
        expect(minted.long_lived_refresh?).to be true
        expect(response.parsed_body[:account][:id]).to eq user.account.id.to_s
      end

      it 'reuses the existing token instead of piling up new ones' do
        expect { 3.times { post '/api/v1/multi_accounts/refresh_token', headers: headers } }
          .to change { long_lived_tokens.count }.from(0).to(1)
      end

      it 'does not reuse a revoked token' do
        post '/api/v1/multi_accounts/refresh_token', headers: headers
        first = response.parsed_body[:token]
        Doorkeeper::AccessToken.find_by(token: first).revoke

        post '/api/v1/multi_accounts/refresh_token', headers: headers

        expect(response.parsed_body[:token]).to_not eq first
        expect(long_lived_tokens.count).to eq 1
      end

      it 'does not widen the scopes the caller already holds' do
        narrow = Fabricate(:access_token, application: web_app, resource_owner_id: user.id, scopes: 'read')

        post '/api/v1/multi_accounts/refresh_token', headers: { 'Authorization' => "Bearer #{narrow.token}" }

        expect(response.parsed_body[:scope]).to eq 'read'
      end

      it 'does not hand a narrower caller the wider token it already minted' do
        post '/api/v1/multi_accounts/refresh_token', headers: headers
        wide = response.parsed_body[:token]

        narrow = Fabricate(:access_token, application: web_app, resource_owner_id: user.id, scopes: 'read')
        post '/api/v1/multi_accounts/refresh_token', headers: { 'Authorization' => "Bearer #{narrow.token}" }

        expect(response.parsed_body[:token]).to_not eq wide
        expect(response.parsed_body[:scope]).to eq 'read'
      end
    end

    context 'when the multi-account client is not configured' do
      before { Rails.configuration.x.multi_account[:client_id] = nil }

      it 'returns 404 rather than a 500' do
        post '/api/v1/multi_accounts/refresh_token', headers: headers

        expect(response).to have_http_status(404)
      end
    end
  end
end
