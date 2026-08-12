# frozen_string_literal: true

require 'rails_helper'

# @_longwhile custom feature
RSpec.describe 'API V1 DM rooms' do
  let(:user)     { Fabricate(:user) }
  let(:token)    { Fabricate(:accessible_access_token, resource_owner_id: user.id, scopes: 'read:statuses write:conversations') }
  let(:headers)  { { 'Authorization' => "Bearer #{token.token}" } }
  let(:me)       { user.account }
  let(:partner)  { Fabricate(:account) }
  let(:stranger) { Fabricate(:account) }

  before { allow(Mastodon::DmChat).to receive(:enabled?).and_return(true) }

  describe 'the feature flag' do
    it 'hides every endpoint behind a 404 when disabled' do
      allow(Mastodon::DmChat).to receive(:enabled?).and_return(false)

      get '/api/v1/dm_rooms', headers: headers

      expect(response).to have_http_status(404)
    end
  end

  describe 'GET /api/v1/dm_rooms' do
    it 'lists rooms I am a member of, most recent first' do
      older = attach(direct_status(me, partner))
      newer = attach(direct_status(me, stranger))

      get '/api/v1/dm_rooms', headers: headers

      expect(response).to have_http_status(200)
      expect(response.parsed_body.pluck('id')).to eq [newer.id.to_s, older.id.to_s]
    end

    it 'does not list rooms belonging to other people' do
      attach(direct_status(partner, stranger))

      get '/api/v1/dm_rooms', headers: headers

      expect(response.parsed_body).to be_empty
    end

    it 'brings back a room whose last_status_id was blanked out of band' do
      room = attach(direct_status(me, partner))
      DmRoom.where(id: room.id).update_all(last_status_id: nil)

      get '/api/v1/dm_rooms', headers: headers

      expect(response.parsed_body.pluck('id')).to eq [room.id.to_s]
      expect(room.reload.last_status_id).to_not be_nil
    end

    it 'does not list a room I left' do
      room = attach(direct_status(me, partner))
      room.dm_room_members.find_by(account_id: me.id).hide!

      get '/api/v1/dm_rooms', headers: headers

      expect(response.parsed_body).to be_empty
    end
  end

  describe 'GET /api/v1/dm_rooms/:id' do
    it 'returns the room to a member' do
      room = attach(direct_status(me, partner))

      get "/api/v1/dm_rooms/#{room.id}", headers: headers

      expect(response).to have_http_status(200)
      expect(response.parsed_body['id']).to eq room.id.to_s
    end

    it 'returns 404 to a non-member' do
      room = attach(direct_status(partner, stranger))

      get "/api/v1/dm_rooms/#{room.id}", headers: headers

      expect(response).to have_http_status(404)
    end

    it 'still returns a room I left' do
      room = attach(direct_status(me, partner))
      room.dm_room_members.find_by(account_id: me.id).hide!

      get "/api/v1/dm_rooms/#{room.id}", headers: headers

      expect(response).to have_http_status(200)
    end
  end

  describe 'GET /api/v1/dm_rooms/:id/statuses' do
    it 'returns 404 to a non-member' do
      room = attach(direct_status(partner, stranger))

      get "/api/v1/dm_rooms/#{room.id}/statuses", headers: headers

      expect(response).to have_http_status(404)
    end

    it 'returns the messages of the room' do
      status = direct_status(me, partner)
      room   = attach(status)

      get "/api/v1/dm_rooms/#{room.id}/statuses", headers: headers

      expect(response).to have_http_status(200)
      expect(response.parsed_body.pluck('id')).to eq [status.id.to_s]
    end

    it 'does not resurrect a room I left when someone reads it' do
      first = direct_status(me, partner)
      room  = attach(first)

      delete "/api/v1/dm_rooms/#{room.id}", headers: headers

      orphan = direct_status(partner, me)
      expect(orphan.conversation.reload.dm_room_id).to be_nil

      get "/api/v1/dm_rooms/#{room.id}/statuses", headers: headers
      get '/api/v1/dm_rooms', headers: headers

      expect(response.parsed_body).to be_empty
    end

    it 'never leaks a non-direct status that shares the conversation' do
      status = direct_status(me, partner)
      room   = attach(status)
      Fabricate(:status, account: me, visibility: :public, thread: status)

      get "/api/v1/dm_rooms/#{room.id}/statuses", headers: headers

      expect(response.parsed_body.pluck('id')).to eq [status.id.to_s]
    end
  end

  describe 'POST /api/v1/dm_rooms' do
    it 'creates a room and returns the same one on a second call' do
      post '/api/v1/dm_rooms', params: { account_ids: [partner.id] }, headers: headers
      first = response.parsed_body['id']

      post '/api/v1/dm_rooms', params: { account_ids: [partner.id] }, headers: headers

      expect(response.parsed_body['id']).to eq first
      expect(DmRoom.count).to eq 1
    end

    it 'rejects an empty recipient list' do
      post '/api/v1/dm_rooms', params: { account_ids: [] }, headers: headers

      expect(response).to have_http_status(422)
    end

    it 'rejects unknown accounts' do
      post '/api/v1/dm_rooms', params: { account_ids: [0] }, headers: headers

      expect(response).to have_http_status(422)
    end

    it 'rejects a participant list that is too long' do
      ids = Array.new(Api::V1::DmRoomsController::MAX_PARTICIPANTS) { Fabricate(:account).id }

      post '/api/v1/dm_rooms', params: { account_ids: ids }, headers: headers

      expect(response).to have_http_status(422)
    end

    it 'does not blow up on a non-array parameter' do
      post '/api/v1/dm_rooms', params: { account_ids: { evil: 1 } }, headers: headers

      expect(response).to have_http_status(422)
    end
  end

  describe 'POST /api/v1/dm_rooms/:id/read' do
    it 'returns 404 to a non-member' do
      room = attach(direct_status(partner, stranger))

      post "/api/v1/dm_rooms/#{room.id}/read", headers: headers

      expect(response).to have_http_status(404)
    end

    it 'clears the unread count and the legacy unread flag' do
      status = direct_status(partner, me)
      room   = attach(status)
      AccountConversation.add_status(me, status)

      post "/api/v1/dm_rooms/#{room.id}/read", headers: headers

      expect(response.parsed_body['unread_count']).to eq 0
      expect(AccountConversation.find_by(account_id: me.id).unread).to be false
    end

    it 'rejects a status that does not belong to the room' do
      room  = attach(direct_status(me, partner))
      other = direct_status(partner, stranger)

      post "/api/v1/dm_rooms/#{room.id}/read", params: { status_id: other.id }, headers: headers

      expect(response).to have_http_status(422)
    end

    it 'rejects a status id that does not exist' do
      room = attach(direct_status(me, partner))

      post "/api/v1/dm_rooms/#{room.id}/read", params: { status_id: 0 }, headers: headers

      expect(response).to have_http_status(422)
    end

    it 'does not move the cursor backwards' do
      first  = direct_status(partner, me)
      second = direct_status(partner, me, thread: first)
      room   = attach(second)

      post "/api/v1/dm_rooms/#{room.id}/read", headers: headers
      post "/api/v1/dm_rooms/#{room.id}/read", params: { status_id: first.id }, headers: headers

      expect(room.dm_room_reads.find_by(account_id: me.id).last_read_status_id).to eq second.id
    end
  end

  describe 'DELETE /api/v1/dm_rooms/:id' do
    it 'returns 404 to a non-member' do
      room = attach(direct_status(partner, stranger))

      delete "/api/v1/dm_rooms/#{room.id}", headers: headers

      expect(response).to have_http_status(404)
    end

    it 'hides the room without deleting anything' do
      status = direct_status(me, partner)
      room   = attach(status)

      delete "/api/v1/dm_rooms/#{room.id}", headers: headers

      expect(response).to have_http_status(200)
      expect(DmRoom.exists?(room.id)).to be true
      expect(Status.exists?(status.id)).to be true
      expect(room.dm_room_members.find_by(account_id: me.id).hidden?).to be true
    end

    it 'leaves the other member alone' do
      room = attach(direct_status(me, partner))

      delete "/api/v1/dm_rooms/#{room.id}", headers: headers

      expect(room.dm_room_members.find_by(account_id: partner.id).hidden?).to be false
    end

    it 'still serves the message history after leaving' do
      status = direct_status(me, partner)
      room   = attach(status)

      delete "/api/v1/dm_rooms/#{room.id}", headers: headers
      get "/api/v1/dm_rooms/#{room.id}/statuses", headers: headers

      expect(response).to have_http_status(200)
      expect(response.parsed_body.pluck('id')).to eq [status.id.to_s]
    end

    it 'keeps the read cursor so the badge is right when the room comes back' do
      status = direct_status(partner, me)
      room   = attach(status)

      post "/api/v1/dm_rooms/#{room.id}/read", headers: headers
      delete "/api/v1/dm_rooms/#{room.id}", headers: headers

      expect(room.dm_room_reads.find_by(account_id: me.id).last_read_status_id).to eq status.id
    end

    it 'comes back when a new message arrives' do
      first = direct_status(me, partner)
      room  = attach(first)

      delete "/api/v1/dm_rooms/#{room.id}", headers: headers
      attach(direct_status(partner, me, thread: first))

      get '/api/v1/dm_rooms', headers: headers

      expect(response.parsed_body.pluck('id')).to eq [room.id.to_s]
    end
  end

  def direct_status(author, recipient, thread: nil)
    status = Fabricate(:status, account: author, visibility: :direct, thread: thread)
    status.mentions.create(account: recipient)
    status
  end

  def attach(status)
    DmRoom.attach_status!(status)
  end
end
