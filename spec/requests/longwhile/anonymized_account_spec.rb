# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Anonymized accounts', :inline_jobs do
  let(:viewer)  { Fabricate(:user, account_attributes: { username: 'viewer' }) }
  let(:former)  { Fabricate(:user, account_attributes: { username: 'formername' }).account }
  let(:token)   { Fabricate(:accessible_access_token, resource_owner_id: viewer.id, scopes: 'read write') }
  let(:headers) { { 'Authorization' => "Bearer #{token.token}" } }

  let!(:post_by_former) { Fabricate(:status, account: former, text: 'still here', visibility: :public) }
  let!(:mention_of_former) { PostStatusService.new.call(viewer.account, text: 'hello @formername', visibility: :public) }

  let(:account_url) { "https://#{Rails.configuration.x.local_domain}/accounts/#{former.id}" }

  before do
    viewer.account.follow!(former)
    DeleteAccountService.new.call(former, reserve_username: true, reserve_email: true, preserve_content: true)
    former.reload
  end

  it 'is anonymized, not erased' do
    expect(former).to be_anonymized
    expect(former.username).to eq 'formername'
  end

  describe 'GET /api/v1/accounts/:id' do
    it 'answers with an id-based url and uri' do
      get "/api/v1/accounts/#{former.id}", headers: headers

      expect(response).to have_http_status(200)
      expect(response.parsed_body).to include(username: 'deleted', acct: 'deleted', url: account_url, uri: account_url)
      expect(response.body).to_not include('formername')
    end
  end

  describe 'GET /api/v1/statuses/:id' do
    it 'keeps the post readable without naming its author' do
      get "/api/v1/statuses/#{post_by_former.id}", headers: headers

      expect(response).to have_http_status(200)
      expect(response.parsed_body).to include(
        id: post_by_former.id.to_s,
        url: "https://#{Rails.configuration.x.local_domain}/statuses/#{post_by_former.id}",
        uri: "https://#{Rails.configuration.x.local_domain}/statuses/#{post_by_former.id}"
      )
      expect(response.body).to_not include('formername')
    end

    it 'shows a mention of the account under the anonymous handle' do
      get "/api/v1/statuses/#{mention_of_former.id}", headers: headers

      expect(response).to have_http_status(200)

      body = response.parsed_body
      expect(body[:mentions]).to contain_exactly(id: former.id.to_s, username: 'deleted', acct: 'deleted', url: account_url)
      expect(body[:content]).to include(%(href="#{account_url}"), "@<span>#{Account::ANONYMIZED_DISPLAY_NAME}</span>")
      expect(response.body).to_not include('formername')
    end
  end

  describe 'account search' do
    it 'does not find the account by its former name' do
      get '/api/v2/search', headers: headers, params: { q: 'formername', type: 'accounts', resolve: true }

      expect(response).to have_http_status(200)
      expect(response.parsed_body[:accounts]).to be_empty
    end

    it 'does not suggest it while typing the former name' do
      get '/api/v1/accounts/search', headers: headers, params: { q: 'formern' }

      expect(response).to have_http_status(200)
      expect(response.parsed_body).to be_empty
    end
  end

  describe 'GET /api/oembed' do
    it 'does not embed posts of an anonymized author' do
      get '/api/oembed', headers: headers, params: { url: "https://#{Rails.configuration.x.local_domain}/@formername/#{post_by_former.id}" }

      expect(response).to have_http_status(404)
      expect(response.body).to_not include('formername')
    end
  end

  describe 'GET /@formername.rss' do
    it 'does not publish a feed under the former name' do
      sign_in viewer

      get '/@formername.rss'

      expect(response).to have_http_status(404)
    end
  end

  describe 'web pages' do
    before { sign_in viewer }

    it 'opens the urls the API now hands out', :aggregate_failures do
      get "/accounts/#{former.id}"
      expect(response).to have_http_status(200)

      get "/statuses/#{post_by_former.id}"
      expect(response).to have_http_status(200)
    end

    it 'opens the post links the web app builds from the anonymous handle', :aggregate_failures do
      get "/@deleted/#{post_by_former.id}"
      expect(response).to have_http_status(200)

      get '/@deleted'
      expect(response).to have_http_status(200)
    end

    it 'keeps old links to the posts working' do
      get "/@formername/#{post_by_former.id}"

      expect(response).to have_http_status(200)
    end
  end

  describe 'the anonymous handle' do
    it 'cannot be registered by anyone' do
      account = Fabricate.build(:account, username: 'deleted')

      expect(account).to_not be_valid
      expect(account.errors[:username]).to be_present
    end
  end
end
