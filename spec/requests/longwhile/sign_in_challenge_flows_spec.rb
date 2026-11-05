# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Sign-in challenges inside the multi-account flows' do
  let(:password) { 'challenge-password-1234' }
  let(:main_user) { Fabricate(:user) }
  let(:inactive_user) { Fabricate(:user, password: password, current_sign_in_at: 100.days.ago) }

  let!(:application) do
    Doorkeeper::Application.create!(name: 'MultiAccount', redirect_uri: 'https://cb.example.com/multi_accounts/callback', scopes: 'read write follow push')
  end

  before { allow(UserMailer).to receive(:sign_in_token).and_call_original }

  around do |example|
    original = Rails.configuration.x.multi_account.dup
    Rails.configuration.x.multi_account[:client_id]    = application.uid
    Rails.configuration.x.multi_account[:redirect_uri] = application.redirect_uri
    example.run
  ensure
    Rails.configuration.x.multi_account = ActiveSupport::HashWithIndifferentAccess.new(original)
  end

  def open_add_account_popup
    sign_in main_user
    get '/multi_accounts/entry'
    entry = response.parsed_body

    get entry[:authorize_url]
    expect(response).to redirect_to(new_user_session_path)

    entry
  end

  def html
    Capybara.string(response.body)
  end

  def request_path_of(url)
    uri = URI(url)
    "#{uri.path}?#{uri.query}"
  end

  describe 'adding an account that must confirm an e-mailed security code' do
    it 'mails a code and shows the code step inside the popup, in Korean' do
      open_add_account_popup

      post user_session_path, params: { user: { email: inactive_user.email, password: password } }

      expect(UserMailer).to have_received(:sign_in_token).with(inactive_user, any_args).once
      expect(response).to have_http_status(200)
      expect(response.body.scan('<html').size).to eq 1
      expect(html).to have_css('h1.title', text: '보안 코드를 입력해 주세요')
      expect(html).to have_field('user[sign_in_token_attempt]')
      expect(html).to have_css('form[novalidate]')
    end

    it 'finishes the OAuth flow in the popup after the code' do
      entry = open_add_account_popup
      post user_session_path, params: { user: { email: inactive_user.email, password: password } }

      post user_session_path, params: { user: { sign_in_token_attempt: inactive_user.reload.sign_in_token } }

      expect(response).to redirect_to(request_path_of(entry[:authorize_url]))

      get response.location
      expect(response).to have_http_status(200)
      expect(controller.current_user).to eq inactive_user

      post '/oauth/authorize', params: { client_id: application.uid, redirect_uri: application.redirect_uri, response_type: 'code', scope: 'read write follow push', state: entry[:state] }

      expect(response.location).to start_with(application.redirect_uri)
      expect(Rack::Utils.parse_query(URI(response.location).query)).to include('state' => entry[:state], 'code' => be_present)
    end

    it 'keeps the way back to the popup across a mistyped code' do
      entry = open_add_account_popup
      post user_session_path, params: { user: { email: inactive_user.email, password: password } }

      post user_session_path, params: { user: { sign_in_token_attempt: 'wrong!' } }

      expect(response).to have_http_status(200)
      expect(html).to have_css('.flash-message', text: '보안 코드가 올바르지 않습니다')

      post user_session_path, params: { user: { sign_in_token_attempt: inactive_user.reload.sign_in_token } }

      expect(response).to redirect_to(request_path_of(entry[:authorize_url]))
    end

    it 'can resend the code without typing anything' do
      open_add_account_popup
      post user_session_path, params: { user: { email: inactive_user.email, password: password } }
      first_token = inactive_user.reload.sign_in_token

      post user_session_path, params: { sign_in_token_resend: '', user: { sign_in_token_attempt: '' } }

      expect(UserMailer).to have_received(:sign_in_token).twice

      expect(response).to have_http_status(200)
      expect(inactive_user.reload.sign_in_token).to_not eq first_token
    end

    it 'lets the main tab sign its account back in when the popup is closed at the code step' do
      entry = open_add_account_popup
      post user_session_path, params: { user: { email: inactive_user.email, password: password } }

      post '/multi_accounts/session/restore', params: { payload: { state: entry[:state], nonce: entry[:nonce] } }

      expect(response).to have_http_status(200)

      get '/settings/profile'
      expect(response).to have_http_status(200)
      expect(controller.current_user).to eq main_user
    end
  end

  describe 'adding an account that uses two-factor authentication' do
    let(:otp_user) { Fabricate(:user, password: password, otp_required_for_login: true, otp_secret: User.generate_otp_secret) }

    it 'asks for the one-time code and then finishes the OAuth flow' do
      entry = open_add_account_popup

      post user_session_path, params: { user: { email: otp_user.email, password: password } }

      expect(response).to have_http_status(200)
      expect(html).to have_field('user[otp_attempt]')

      post user_session_path, params: { user: { otp_attempt: '000000' } }

      expect(html).to have_css('.flash-message', text: '2단계 인증 코드가 올바르지 않습니다')

      post user_session_path, params: { user: { otp_attempt: otp_user.current_otp } }

      expect(response).to redirect_to(request_path_of(entry[:authorize_url]))
    end
  end

  describe 'an ordinary sign-in of an inactive account' do
    it 'lands on the home screen after the code' do
      post user_session_path, params: { user: { email: inactive_user.email, password: password } }
      post user_session_path, params: { user: { sign_in_token_attempt: inactive_user.reload.sign_in_token } }

      expect(response).to redirect_to(root_path)
      expect(inactive_user.reload.current_sign_in_at).to be_within(1.minute).of(Time.now.utc)
    end
  end

  describe 'switching to an account that has been inactive for a long time' do
    let(:refresh_token) do
      Fabricate(:access_token, application: application, resource_owner_id: inactive_user.id, scopes: 'read write follow',
                               expires_in: 10.years.to_i, multi_account: true, purpose: 'multi_account_refresh', long_lived: true)
    end

    before { allow(MultiAccountConfig).to receive(:refresh_flow_enabled?).and_return(true) }

    it 'switches without asking for an e-mailed code' do
      sign_in main_user

      post '/api/v1/multi_accounts/session/refresh', params: { refresh_token: refresh_token.token }

      expect(UserMailer).to_not have_received(:sign_in_token)

      expect(response).to have_http_status(200)

      get '/settings/profile'
      expect(controller.current_user).to eq inactive_user
    end
  end

  describe 'accounts that can no longer sign in' do
    before { allow(MultiAccountConfig).to receive(:refresh_flow_enabled?).and_return(true) }

    it 'refuses to switch to a memorialized account and keeps the current session' do
      target = Fabricate(:user)
      token = Fabricate(:access_token, application: application, resource_owner_id: target.id, scopes: 'read write follow',
                                       expires_in: 10.years.to_i, multi_account: true, purpose: 'multi_account_refresh', long_lived: true)
      target.account.update!(memorial: true)
      sign_in main_user

      post '/api/v1/multi_accounts/session/refresh', params: { refresh_token: token.token }

      expect(response).to have_http_status(403)

      get '/settings/profile'
      expect(response).to have_http_status(200)
      expect(controller.current_user).to eq main_user
    end

    it 'refuses to restore a memorialized account' do
      MultiAccounts::StateStore.store!(state: 'state-m', nonce: 'nonce-m', user_id: main_user.id, redirect_uri: application.redirect_uri)
      main_user.account.update!(memorial: true)

      post '/multi_accounts/session/restore', params: { payload: { state: 'state-m', nonce: 'nonce-m' } }

      expect(response).to have_http_status(403)
    end
  end

  describe 'the whole-instance DM screen right after switching to an admin' do
    let(:admin) { Fabricate(:admin_user) }
    let(:refresh_token) do
      Fabricate(:access_token, application: application, resource_owner_id: admin.id, scopes: 'read write follow',
                               expires_in: 10.years.to_i, multi_account: true, purpose: 'multi_account_refresh', long_lived: true)
    end

    before do
      allow(MultiAccountConfig).to receive(:refresh_flow_enabled?).and_return(true)
      allow(Mastodon::DmChat).to receive(:enabled?).and_return(true)
    end

    def bearer(token)
      { 'Authorization' => "Bearer #{token}" }
    end

    it 'is served with the page token of the new session, not the switch token' do
      sign_in main_user
      post '/api/v1/multi_accounts/session/refresh', params: { refresh_token: refresh_token.token }
      switch_token = response.parsed_body[:token]

      get '/messages/all'
      page_token = JSON.parse(response.parsed_body.at_css('script#initial-state').text).dig('meta', 'access_token')

      page_access_token = Doorkeeper::AccessToken.by_token(page_token)
      expect(page_access_token.resource_owner_id).to eq admin.id
      expect(page_access_token.application).to be_superapp

      get '/api/v1/admin/dm_rooms', headers: bearer(page_token)
      expect(response).to have_http_status(200)

      get '/api/v1/admin/dm_rooms', headers: bearer(switch_token)
      expect(response).to have_http_status(403)
    end
  end
end
