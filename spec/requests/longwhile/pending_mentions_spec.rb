# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Pending mentions contract', :inline_jobs do
  let(:alice)   { Fabricate(:user, account_attributes: { username: 'alice' }) }
  let(:bob)     { Fabricate(:account, username: 'bob') }
  let(:token)   { Fabricate(:accessible_access_token, resource_owner_id: alice.id, scopes: 'read write') }
  let(:headers) { { 'Authorization' => "Bearer #{token.token}" } }

  before do
    alice.account.follow!(bob)
    bob.follow!(alice.account)
  end

  def mention_from_bob
    PostStatusService.new.call(bob, text: 'Hello @alice')
  end

  def notification_groups
    get '/api/v2/notifications', headers: headers, params: { types: ['mention'], exclude_direct_messages: true }

    expect(response).to have_http_status(200)
    response.parsed_body
  end

  def status_json(body, status)
    body[:statuses].find { |item| item[:id] == status.id.to_s }
  end

  describe 'GET /api/v2/notifications' do
    it 'labels each mention group with the visibility of its status' do
      status = mention_from_bob

      body  = notification_groups
      group = body[:notification_groups].sole

      expect(group).to include(type: 'mention', status_id: status.id.to_s, status_visibility: 'private')
    end

    it 'reports replied as false until I answer, then true' do
      status = mention_from_bob

      expect(status_json(notification_groups, status)).to include(replied: false, favourited: false)

      PostStatusService.new.call(alice.account, text: '@bob hi', thread: status)

      expect(status_json(notification_groups, status)).to include(replied: true)
    end

    it 'reports favourited once I like the mention' do
      status = mention_from_bob
      FavouriteService.new.call(alice.account, status)

      expect(status_json(notification_groups, status)).to include(favourited: true, replied: false)
    end

    it 'does not count somebody else answering as my reply' do
      status = mention_from_bob
      PostStatusService.new.call(bob, text: '@alice again', thread: status)

      expect(status_json(notification_groups, status)).to include(replied: false)
    end

    it 'drops mentions from an account that left' do
      mention_from_bob
      bob.update!(anonymized_at: Time.now.utc)

      expect(notification_groups[:notification_groups]).to be_empty
    end
  end

  describe 'GET /api/v1/statuses/:id' do
    it 'carries replied for the signed-in reader' do
      status = mention_from_bob
      PostStatusService.new.call(alice.account, text: '@bob hi', thread: status)

      get "/api/v1/statuses/#{status.id}", headers: headers

      expect(response).to have_http_status(200)
      expect(response.parsed_body).to include(replied: true)
    end
  end

  describe 'GET /api/v1/timelines/home' do
    it 'carries replied on statuses rendered through the relationships presenter' do
      answered = PostStatusService.new.call(bob, text: 'first')
      pending  = PostStatusService.new.call(bob, text: 'second')
      PostStatusService.new.call(alice.account, text: '@bob reply', thread: answered)

      get '/api/v1/timelines/home', headers: headers

      expect(response).to have_http_status(200)
      body = response.parsed_body
      expect(body.find { |item| item[:id] == answered.id.to_s }).to include(replied: true)
      expect(body.find { |item| item[:id] == pending.id.to_s }).to include(replied: false)
    end
  end
end
