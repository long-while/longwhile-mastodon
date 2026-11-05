# frozen_string_literal: true

require 'rails_helper'

# @_longwhile — DM 채팅(/messages)의 백엔드 계약 중 spec/requests/api/v1/dm_rooms_spec.rb
#   가 다루지 않는 것: 보내기(실제 경로), 방 JSON 의 모양, 제목, 멤버 관리, 별명,
#   "나에게서만 삭제", 읽음 표시의 상호주의.
#
#   채팅 화면은 방 JSON 의 키를 그대로 읽는다(api_types/dm_rooms.ts). 시스템 메시지는
#   spoiler_text 의 접두어로 가려낸다(features/messages/util/title_event.ts). 둘 다
#   서버와 프론트가 같은 문자열을 따로 들고 있어서, 한쪽이 바뀌면 오류 없이 틀어진다.
RSpec.describe 'DM room management' do
  let(:user)    { Fabricate(:user) }
  let(:me)      { user.account }
  let(:partner) { Fabricate(:user).account }
  let(:third)   { Fabricate(:user).account }
  let(:token)   { Fabricate(:accessible_access_token, resource_owner_id: user.id, scopes: 'read write') }
  let(:headers) { { 'Authorization' => "Bearer #{token.token}" } }

  let(:partner_token)   { Fabricate(:accessible_access_token, resource_owner_id: partner.user.id, scopes: 'read write') }
  let(:partner_headers) { { 'Authorization' => "Bearer #{partner_token.token}" } }

  before { allow(Mastodon::DmChat).to receive(:enabled?).and_return(true) }

  def create_room(*accounts)
    post '/api/v1/dm_rooms', headers: headers, params: { account_ids: accounts.map { |account| account.id.to_s } }
    expect(response).to have_http_status(200)
    DmRoom.find(response.parsed_body[:id])
  end

  # 웹의 보내기와 같은 요청(api/dm_rooms.ts 의 apiSendDmMessage).
  def send_dm(text, to:, from_headers: headers, in_reply_to_id: nil)
    post '/api/v1/statuses', headers: from_headers, params: {
      status: "#{to.map { |account| "@#{account.acct}" }.join(' ')} #{text}",
      visibility: 'direct',
      allowed_mentions: to.map { |account| account.id.to_s },
      in_reply_to_id: in_reply_to_id,
    }.compact
    expect(response).to have_http_status(200)
    response.parsed_body
  end

  def room_messages(room, as: headers)
    get "/api/v1/dm_rooms/#{room.id}/statuses", headers: as
    expect(response).to have_http_status(200)
    response.parsed_body
  end

  describe 'sending through POST /api/v1/statuses' do
    it 'keeps the message direct and files it in the room at once' do
      room    = create_room(partner)
      message = send_dm('hello', to: [partner])

      expect(message[:visibility]).to eq 'direct'
      expect(room_messages(room).pluck(:id)).to eq [message[:id]]

      get "/api/v1/dm_rooms/#{room.id}", headers: partner_headers
      expect(response.parsed_body).to include(unread_count: 1)
      expect(response.parsed_body.dig(:last_status, :id)).to eq message[:id]
    end

    it 'gives the room a root the next reply can thread on' do
      room  = create_room(partner)
      first = send_dm('hello', to: [partner])

      get "/api/v1/dm_rooms/#{room.id}", headers: headers
      expect(response.parsed_body[:root_status_id]).to eq first[:id]

      reply = send_dm('again', to: [partner], in_reply_to_id: first[:id])

      expect(room_messages(room).pluck(:id)).to eq [reply[:id], first[:id]]
    end
  end

  describe 'the room JSON' do
    it 'carries every key the chat screen reads, with string ids' do
      room = create_room(partner)
      send_dm('hello', to: [partner])

      get "/api/v1/dm_rooms/#{room.id}", headers: headers

      body = response.parsed_body
      expect(body.keys).to include(
        'id', 'accounts', 'last_status', 'unread_count', 'root_status_id', 'last_read_status_id',
        'participant_read_states', 'is_group', 'is_local', 'title', 'creator_id', 'nicknames'
      )
      expect(body).to include(id: room.id.to_s, creator_id: me.id.to_s, is_group: false, is_local: true, title: nil, nicknames: {})
      expect(body[:accounts].pluck(:id)).to eq [partner.id.to_s]
    end
  end

  describe 'PATCH /api/v1/dm_rooms/:id/title' do
    it 'renames the room and leaves a system message the client recognises' do
      room = create_room(partner)
      send_dm('hello', to: [partner])

      patch "/api/v1/dm_rooms/#{room.id}/title", headers: headers, params: { title: '  주말 계획  ' }

      expect(response).to have_http_status(200)
      expect(response.parsed_body[:title]).to eq '주말 계획'
      expect(room_messages(room, as: partner_headers).first[:spoiler_text]).to start_with(DmRoom::TITLE_EVENT_PREFIX)
      expect(DmRoom::TITLE_EVENT_PREFIX).to eq 'conversation:title_changed:'
    end

    it 'does not post again when the title did not change' do
      room = create_room(partner)
      send_dm('hello', to: [partner])
      patch "/api/v1/dm_rooms/#{room.id}/title", headers: headers, params: { title: 'same' }

      expect { patch "/api/v1/dm_rooms/#{room.id}/title", headers: headers, params: { title: 'same' } }
        .to_not(change { Status.where(account: me).count })
    end

    it 'rejects a title that is too long' do
      room = create_room(partner)

      patch "/api/v1/dm_rooms/#{room.id}/title", headers: headers, params: { title: 'a' * (DmRoom::TITLE_MAX_LENGTH + 1) }

      expect(response).to have_http_status(422)
      expect(room.reload.title).to be_nil
    end

    it 'is not reachable by someone outside the room' do
      room = create_room(partner)
      stranger_token = Fabricate(:accessible_access_token, resource_owner_id: Fabricate(:user).id, scopes: 'read write')

      patch "/api/v1/dm_rooms/#{room.id}/title", headers: { 'Authorization' => "Bearer #{stranger_token.token}" }, params: { title: 'mine now' }

      expect(response).to have_http_status(404)
      expect(room.reload.title).to be_nil
    end
  end

  describe 'members' do
    it 'invites into the same room, which becomes a group, and announces it' do
      room = create_room(partner)
      send_dm('hello', to: [partner])

      post "/api/v1/dm_rooms/#{room.id}/members", headers: headers, params: { account_ids: [third.id.to_s] }

      expect(response).to have_http_status(200)
      expect(response.parsed_body).to include(id: room.id.to_s, is_group: true)
      expect(response.parsed_body[:accounts].pluck(:id)).to contain_exactly(partner.id.to_s, third.id.to_s)
      expect(room_messages(room).first[:spoiler_text]).to start_with(DmRoom::MEMBER_EVENT_PREFIX)
      expect(DmRoom::MEMBER_EVENT_PREFIX).to eq 'conversation:members_changed:'
    end

    it 'refuses a roster that another room already has' do
      room = create_room(partner)
      create_room(partner, third)

      post "/api/v1/dm_rooms/#{room.id}/members", headers: headers, params: { account_ids: [third.id.to_s] }

      expect(response).to have_http_status(422)
      expect(room.reload.member_count).to eq 2
    end

    it 'lets only the creator remove someone' do
      room = create_room(partner, third)

      delete "/api/v1/dm_rooms/#{room.id}/members/#{third.id}", headers: partner_headers
      expect(response).to have_http_status(403)

      delete "/api/v1/dm_rooms/#{room.id}/members/#{third.id}", headers: headers
      expect(response).to have_http_status(200)
      expect(response.parsed_body[:accounts].pluck(:id)).to eq [partner.id.to_s]
    end

    it 'does not let the creator remove themselves through the kick route' do
      room = create_room(partner, third)

      delete "/api/v1/dm_rooms/#{room.id}/members/#{me.id}", headers: headers

      expect(response).to have_http_status(403)
      expect(room.reload.member_count).to eq 3
    end

    it 'keeps a nickname visible only to the person who set it' do
      room = create_room(partner)

      put "/api/v1/dm_rooms/#{room.id}/members/#{partner.id}/nickname", headers: headers, params: { nickname: '단짝' }
      expect(response).to have_http_status(200)
      expect(response.parsed_body[:nicknames]).to eq(partner.id.to_s => '단짝')

      get "/api/v1/dm_rooms/#{room.id}", headers: partner_headers
      expect(response.parsed_body[:nicknames]).to eq({})

      put "/api/v1/dm_rooms/#{room.id}/members/#{partner.id}/nickname", headers: headers, params: { nickname: '' }
      expect(response.parsed_body[:nicknames]).to eq({})
    end

    it 'refuses a nickname for someone who is not in the room' do
      room = create_room(partner)

      put "/api/v1/dm_rooms/#{room.id}/members/#{third.id}/nickname", headers: headers, params: { nickname: 'x' }

      expect(response).to have_http_status(404)
    end
  end

  describe 'POST /api/v1/dm_rooms/:id/statuses/:status_id/hide' do
    it "hides the partner's message from me only" do
      room    = create_room(partner)
      message = send_dm('secret', to: [me], from_headers: partner_headers)

      post "/api/v1/dm_rooms/#{room.id}/statuses/#{message[:id]}/hide", headers: headers

      expect(response).to have_http_status(200)
      expect(room_messages(room).pluck(:id)).to_not include(message[:id])
      expect(room_messages(room, as: partner_headers).pluck(:id)).to include(message[:id])
    end

    it 'answers 404 for a message of another room' do
      room  = create_room(partner)
      other = send_dm('elsewhere', to: [third])

      post "/api/v1/dm_rooms/#{room.id}/statuses/#{other[:id]}/hide", headers: headers

      expect(response).to have_http_status(404)
    end
  end

  # 읽음 표시는 상호주의다(FR-19). 판정은 서버가 한다 — 클라이언트 판정은 우회된다.
  describe 'participant_read_states' do
    it "shows the partner's cursor and never the time it was read" do
      room    = create_room(partner)
      message = send_dm('hello', to: [partner])
      post "/api/v1/dm_rooms/#{room.id}/read", headers: partner_headers

      get "/api/v1/dm_rooms/#{room.id}", headers: headers

      expect(response.parsed_body[:participant_read_states]).to eq [{ 'account_id' => partner.id.to_s, 'last_read_status_id' => message[:id] }]
    end

    it 'is an empty list, not a missing key, when I turned read receipts off' do
      room = create_room(partner)
      send_dm('hello', to: [partner])
      post "/api/v1/dm_rooms/#{room.id}/read", headers: partner_headers
      user.update!(settings_attributes: { dm_read_receipts: false })

      get "/api/v1/dm_rooms/#{room.id}", headers: headers

      expect(response.parsed_body).to include(participant_read_states: [])
    end

    it 'leaves out a partner who turned read receipts off' do
      room = create_room(partner)
      send_dm('hello', to: [partner])
      post "/api/v1/dm_rooms/#{room.id}/read", headers: partner_headers
      partner.user.update!(settings_attributes: { dm_read_receipts: false })

      get "/api/v1/dm_rooms/#{room.id}", headers: headers

      expect(response.parsed_body[:participant_read_states]).to eq []
    end

    it 'tells the client the setting through verify_credentials' do
      user.update!(settings_attributes: { dm_read_receipts: false })

      get '/api/v1/accounts/verify_credentials', headers: headers

      expect(response.parsed_body.dig(:source, :dm_read_receipts)).to be false
    end
  end
end
