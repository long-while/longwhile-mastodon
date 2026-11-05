# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Whole-instance direct messages' do
  let(:alice) { Fabricate(:account, username: 'alice') }
  let(:bob)   { Fabricate(:account, username: 'bob') }

  let!(:room) do
    status = Fabricate(:status, account: alice, visibility: :direct, text: 'between us')
    status.mentions.create!(account: bob)
    DmRoom.attach_status!(status)
  end

  let(:message) { room.last_status }

  before { allow(Mastodon::DmChat).to receive(:enabled?).and_return(true) }

  let(:web_app) { Doorkeeper::Application.create!(name: 'Web', redirect_uri: 'urn:ietf:wg:oauth:2.0:oob', scopes: 'read write follow push', superapp: true) }

  def headers_for(user)
    token = Fabricate(:accessible_access_token, application: web_app, resource_owner_id: user.id, scopes: 'read write follow')
    { 'Authorization' => "Bearer #{token.token}" }
  end

  describe 'GET /api/v1/admin/dm_rooms' do
    it 'lists rooms the owner is not a member of' do
      get '/api/v1/admin/dm_rooms', headers: headers_for(Fabricate(:owner_user))

      expect(response).to have_http_status(200)
      expect(response.parsed_body.pluck(:id)).to eq [room.id.to_s]
      expect(response.parsed_body.first[:accounts].pluck(:id)).to contain_exactly(alice.id.to_s, bob.id.to_s)
      expect(response.parsed_body.first.dig(:last_status, :id)).to eq message.id.to_s
    end

    it 'is open to an admin' do
      get '/api/v1/admin/dm_rooms', headers: headers_for(Fabricate(:admin_user))

      expect(response).to have_http_status(200)
    end

    it 'is closed to a moderator' do
      get '/api/v1/admin/dm_rooms', headers: headers_for(Fabricate(:moderator_user))

      expect(response).to have_http_status(403)
    end

    it 'is closed to a regular user' do
      get '/api/v1/admin/dm_rooms', headers: headers_for(Fabricate(:user))

      expect(response).to have_http_status(403)
    end

    it 'disappears with the DM feature' do
      allow(Mastodon::DmChat).to receive(:enabled?).and_return(false)

      get '/api/v1/admin/dm_rooms', headers: headers_for(Fabricate(:owner_user))

      expect(response).to have_http_status(404)
    end

    it "does not expose the members' read cursors or nicknames" do
      get "/api/v1/admin/dm_rooms/#{room.id}", headers: headers_for(Fabricate(:owner_user))

      expect(response).to have_http_status(200)
      expect(response.parsed_body.keys).to_not include('participant_read_states', 'nicknames')
      expect(response.parsed_body).to include(id: room.id.to_s, unread_count: 0, last_read_status_id: nil)
    end
  end

  describe 'GET /api/v1/admin/dm_rooms/:id/statuses' do
    it 'returns the messages, including ones a member hid for themselves' do
      DmHiddenStatus.create!(account_id: bob.id, status_id: message.id)

      get "/api/v1/admin/dm_rooms/#{room.id}/statuses", headers: headers_for(Fabricate(:owner_user))

      expect(response).to have_http_status(200)
      expect(response.parsed_body.pluck(:id)).to eq [message.id.to_s]
    end

    it 'is closed to a moderator' do
      get "/api/v1/admin/dm_rooms/#{room.id}/statuses", headers: headers_for(Fabricate(:moderator_user))

      expect(response).to have_http_status(403)
    end
  end

  describe 'GET /api/v1/statuses/:id for a direct message' do
    it 'lets the owner open a DM they were not part of' do
      get "/api/v1/statuses/#{message.id}", headers: headers_for(Fabricate(:owner_user))

      expect(response).to have_http_status(200)
    end

    it 'still hides it from a moderator' do
      get "/api/v1/statuses/#{message.id}", headers: headers_for(Fabricate(:moderator_user))

      expect(response).to have_http_status(404)
    end
  end

  describe 'GET /admin/direct_messages' do
    it 'shows the messages to an admin' do
      sign_in Fabricate(:admin_user)

      get '/admin/direct_messages'

      expect(response).to have_http_status(200)
      expect(response.body).to include('between us')
    end

    it 'is forbidden to a moderator' do
      sign_in Fabricate(:moderator_user)

      get '/admin/direct_messages'

      expect(response).to have_http_status(403)
    end
  end
end
