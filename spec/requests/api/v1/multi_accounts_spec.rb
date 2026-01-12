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
end

  describe 'POST /api/v1/multi_accounts/session/refresh' do
    let(:user) { Fabricate(:user) }
    let(:access_token) { Fabricate(:access_token, resource_owner_id: user.id, multi_account: true) }
    let(:result) { MultiAccounts::RefreshService::Result.new(access_token: access_token, account: user.account) }
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
end
