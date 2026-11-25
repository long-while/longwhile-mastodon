# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Multi-account link groups' do
  let(:same_origin_headers) { { 'Origin' => "https://#{Rails.configuration.x.local_domain}" } }
  let(:password) { 'link-flow-password-1234' }
  let(:main_user) { Fabricate(:user, password: password) }
  let(:second_user) { Fabricate(:user, password: password) }
  let(:stranger) { Fabricate(:user, password: password) }

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

  before { allow(MultiAccountConfig).to receive(:refresh_flow_enabled?).and_return(true) }

  def mint_switch_token
    post '/api/v1/multi_accounts/refresh_token'
    expect(response).to have_http_status(200)
    response.parsed_body[:token]
  end

  def add_account(user)
    get '/multi_accounts/entry'
    entry = response.parsed_body

    get entry[:authorize_url]
    expect(response).to redirect_to(new_user_session_path)

    post user_session_path, params: { user: { email: user.email, password: password } }
    get response.location

    post '/oauth/authorize', params: { client_id: application.uid, redirect_uri: application.redirect_uri, response_type: 'code', scope: 'read write follow push', state: entry[:state] }
    code = Rack::Utils.parse_query(URI(response.location).query)['code']

    post '/api/v1/multi_accounts/consume', params: { payload: { state: entry[:state], nonce: entry[:nonce], authorization_code: code } }
    expect(response).to have_http_status(200)
    response.parsed_body[:token]
  end

  def switch_with(token)
    post '/api/v1/multi_accounts/session/refresh', params: { refresh_token: token }, headers: same_origin_headers
  end

  def signed_in_user
    get '/settings/profile'
    controller.current_user
  end

  it 'links the accounts on add and lets the person switch back and forth' do
    sign_in main_user
    main_token = mint_switch_token

    second_token = add_account(second_user)

    switch_with(second_token)
    expect(response).to have_http_status(200)
    expect(signed_in_user).to eq second_user

    switch_with(main_token)
    expect(response).to have_http_status(200)
    expect(signed_in_user).to eq main_user
  end

  it 'refuses the saved tokens once somebody else signs in on the same browser' do
    sign_in main_user
    second_token = add_account(second_user)

    delete destroy_user_session_path
    sign_in stranger

    switch_with(second_token)

    expect(response).to have_http_status(403)
    expect(response.parsed_body[:code]).to eq('multi_account_not_linked')
    expect(signed_in_user).to eq stranger
  end

  it 'ignores a bearer token when deciding who is signed in' do
    sign_in main_user
    main_token = mint_switch_token
    second_token = add_account(second_user)
    delete destroy_user_session_path

    post '/api/v1/multi_accounts/session/refresh',
         params: { refresh_token: second_token },
         headers: same_origin_headers.merge('Authorization' => "Bearer #{main_token}")

    expect(response).to have_http_status(401)
    expect(Doorkeeper::AccessToken.where(resource_owner_id: second_user.id, purpose: 'multi_account_session')).to be_empty
  end

  it 'refuses the saved tokens after a plain sign out' do
    sign_in main_user
    second_token = add_account(second_user)

    delete destroy_user_session_path
    switch_with(second_token)

    expect(response).to have_http_status(401)
  end

  it 'needs the account to be added again after the password changes' do
    sign_in main_user
    second_token = add_account(second_user)
    switch_with(second_token)
    expect(signed_in_user).to eq second_user

    second_user.reload.revoke_multi_account_tokens!

    switch_with(second_token)
    expect(response).to have_http_status(401)
  end
end
