# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Multi-account popup' do
  let(:same_origin_headers) { { 'Origin' => "https://#{Rails.configuration.x.local_domain}" } }
  let(:user) { Fabricate(:user) }

  let!(:application) do
    Doorkeeper::Application.create!(name: 'MultiAccount', redirect_uri: 'https://cb.example.com/multi_accounts/callback', scopes: 'read write follow push')
  end

  around do |example|
    original = Rails.configuration.x.multi_account.dup
    Rails.configuration.x.multi_account[:client_id]    = application.uid
    Rails.configuration.x.multi_account[:redirect_uri] = application.redirect_uri
    example.run
  ensure
    Rails.configuration.x.multi_account = ActiveSupport::HashWithIndifferentAccess.new(original)
  end

  describe 'GET /multi_accounts/entry' do
    it 'needs a signed-in session' do
      get '/multi_accounts/entry', headers: { 'Accept' => 'application/json' }

      expect(response).to have_http_status(401)
    end

    it 'returns an authorize URL for the multi-account client that forces a fresh login' do
      sign_in user

      get '/multi_accounts/entry'

      expect(response).to have_http_status(200)
      body  = response.parsed_body
      query = Rack::Utils.parse_query(URI(body[:authorize_url]).query)

      expect(URI(body[:authorize_url]).path).to eq '/oauth/authorize'
      expect(query).to include('client_id' => application.uid, 'redirect_uri' => application.redirect_uri, 'response_type' => 'code', 'prompt' => 'login', 'state' => body[:state])
      expect(body[:nonce]).to be_present
      expect(MultiAccounts::StateStore.fetch(body[:state])).to include(user_id: user.id, nonce: body[:nonce])
    end

    it 'answers 503 with a message when the client is not configured' do
      Rails.configuration.x.multi_account[:client_id] = nil
      sign_in user

      get '/multi_accounts/entry'

      expect(response).to have_http_status(503)
      expect(response.parsed_body[:error]).to be_present
    end
  end

  describe 'GET /multi_accounts/callback' do
    def store_state
      MultiAccounts::StateStore.store!(state: 'state-1', nonce: 'nonce-1', user_id: user.id, redirect_uri: application.redirect_uri)
    end

    before { sign_in user }

    it 'renders a bare page that hands the code to the opener only' do
      store_state

      get '/multi_accounts/callback', params: { state: 'state-1', code: 'the-code' }

      expect(response).to have_http_status(200)
      expect(response.body.scan('<html').size).to eq 1
      expect(response.body).to_not include('initial-state')
      expect(response.body).to include("targetOrigin = 'https://cb.example.com'")
      expect(response.body).to include("code: 'the-code'")
      expect(response.body).to include('window.opener')
      expect(response.body).to_not match(/postMessage\([^;]*'\*'\)/m)
    end

    it 'reports an expired state as an error page' do
      get '/multi_accounts/callback', params: { state: 'unknown', code: 'the-code' }

      expect(response).to have_http_status(400)
      expect(response.body).to include('Authorization Error')
    end

    it 'reports a missing code as an error page' do
      store_state

      get '/multi_accounts/callback', params: { state: 'state-1' }

      expect(response).to have_http_status(400)
    end
  end

  describe 'POST /multi_accounts/session/restore' do
    before do
      MultiAccounts::StateStore.store!(state: 'state-2', nonce: 'nonce-2', user_id: user.id, redirect_uri: application.redirect_uri)
    end

    it 'signs the original account back in for the matching nonce, once' do
      post '/multi_accounts/session/restore', params: { payload: { state: 'state-2', nonce: 'nonce-2' } }, headers: same_origin_headers

      expect(response).to have_http_status(200)

      get '/settings/profile'
      expect(response).to have_http_status(200)
      expect(controller.current_user).to eq user

      post '/multi_accounts/session/restore', params: { payload: { state: 'state-2', nonce: 'nonce-2' } }, headers: same_origin_headers
      expect(response).to have_http_status(401)
    end

    it 'refuses a wrong nonce and signs nobody in' do
      post '/multi_accounts/session/restore', params: { payload: { state: 'state-2', nonce: 'guess' } }, headers: same_origin_headers

      expect(response).to have_http_status(401)

      get '/settings/profile'
      expect(response).to redirect_to(new_user_session_path)
    end

    it 'refuses a suspended account' do
      user.account.suspend!

      post '/multi_accounts/session/restore', params: { payload: { state: 'state-2', nonce: 'nonce-2' } }, headers: same_origin_headers

      expect(response).to have_http_status(403)
    end
  end
end
