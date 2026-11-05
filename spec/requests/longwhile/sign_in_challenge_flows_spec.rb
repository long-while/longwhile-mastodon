# frozen_string_literal: true

require 'rails_helper'

# @_longwhile — 4.7.4 의 "오래 안 쓴 계정은 메일 보안 코드"(#40745)와 2단계 인증이
#   다중 계정 흐름과 만나는 자리를 사용자 동선대로 걷는다.
#
#   계정 추가 팝업은 `prompt=login` 으로 공유 세션을 로그아웃시키고 "로그인 뒤 돌아갈 곳"
#   표식을 남긴다. 그 사이에 비밀번호 말고 한 단계(코드 입력)가 더 끼면, 표식이 그 단계를
#   건너서 살아남아야 팝업이 인가 화면으로 돌아가 흐름을 끝낸다.
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

  # 메인 탭이 /multi_accounts/entry 로 인가 주소를 받고, 팝업이 그 주소를 연다.
  # 강제 로그인이 공유 세션을 로그아웃시키고 로그인 화면으로 보낸다.
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

  # 요청 스펙은 기본 로캘(:en)에서 돈다 — `DEFAULT_LOCALE` 이 없는 운영 서버와 같다.
  # 코드 단계는 Localized 의 around_action 보다 먼저 도는 필터가 그리므로, 로캘을
  # 따로 걸지 않으면 영어로 나온다.
  describe 'adding an account that must confirm an e-mailed security code' do
    it 'mails a code and shows the code step inside the popup, in Korean' do
      open_add_account_popup

      post user_session_path, params: { user: { email: inactive_user.email, password: password } }

      expect(UserMailer).to have_received(:sign_in_token).with(inactive_user, any_args).once
      expect(response).to have_http_status(200)
      expect(response.body.scan('<html').size).to eq 1
      expect(html).to have_css('h1.title', text: '보안 코드를 입력해 주세요')
      expect(html).to have_field('user[sign_in_token_attempt]')
      # 다시 보내기 단추는 빈 칸으로 눌러야 하므로 브라우저 검증이 막으면 안 된다.
      expect(html).to have_css('form[novalidate]')
    end

    it 'finishes the OAuth flow in the popup after the code' do
      entry = open_add_account_popup
      post user_session_path, params: { user: { email: inactive_user.email, password: password } }

      post user_session_path, params: { user: { sign_in_token_attempt: inactive_user.reload.sign_in_token } }

      expect(response).to redirect_to(request_path_of(entry[:authorize_url]))

      # 표식이 돌려보낸 인가 화면은 다시 로그아웃시키지 않고, 새로 로그인한 계정으로 동의를 받는다.
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

    # 저장된 전환 토큰은 그 계정에 이미 로그인해서 받은 것이다. 메일 코드를 다시 묻지 않는다.
    it 'switches without asking for an e-mailed code' do
      sign_in main_user

      post '/api/v1/multi_accounts/session/refresh', params: { refresh_token: refresh_token.token }

      expect(UserMailer).to_not have_received(:sign_in_token)

      expect(response).to have_http_status(200)

      get '/settings/profile'
      expect(controller.current_user).to eq inactive_user
    end
  end

  # 추모 계정은 Devise 의 `active_for_authentication?` 가 거절한다. 그런 계정으로
  # `sign_in` 하면 warden 이 던져 버려서, 전환은 이미 `reset_session` 을 한 뒤라
  # **원래 계정까지 로그아웃된 채** 401 로 끝났다. 정지 계정처럼 손대기 전에 403 으로 막는다.
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

  # 전체 DM(/messages/all) API 는 웹 UI(superapp)·admin:read 토큰만 받는다(7f402d82de).
  # 전환 토큰은 다중 계정 앱 소유라 거기 해당하지 않지만, 전환은 새로고침으로 끝나고
  # 새 페이지는 새 세션의 SessionActivation 토큰(superapp)을 들고 나온다.
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

      # 전환 직후 잠깐 깔리는 토큰은 verify_credentials 에만 쓰인다. 전체 DM 은 열지 않는다.
      get '/api/v1/admin/dm_rooms', headers: bearer(switch_token)
      expect(response).to have_http_status(403)
    end
  end
end
