# frozen_string_literal: true

require 'rails_helper'

# @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
#   여기서 지키는 것 중 가장 중요한 것은 **비멤버가 남의 방에 닿을 수 없다**는 것이다.
#   방 id 는 순차 증가하는 정수라 열거가 가능하다. (기획서 §11.1)
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

    # last_status_id 가 null 로 남은 방은 목록 쿼리에서 빠진다. 그래서 페이지를 만들기
    # 전에 따로 고쳐 주지 않으면 영영 돌아오지 않는다. (delete_all 경로, 플래그 토글)
    it 'brings back a room whose last_status_id was blanked out of band' do
      room = attach(direct_status(me, partner))
      DmRoom.where(id: room.id).update_all(last_status_id: nil)

      get '/api/v1/dm_rooms', headers: headers

      expect(response.parsed_body.pluck('id')).to eq [room.id.to_s]
      expect(room.reload.last_status_id).to_not be_nil
    end

    it 'reports each room its own unread count' do
      quiet = attach(direct_status(me, partner))
      busy  = attach(direct_status(stranger, me))
      attach(direct_status(stranger, me, thread: busy.last_status))

      get '/api/v1/dm_rooms', headers: headers

      counts = response.parsed_body.to_h { |room| [room['id'], room['unread_count']] }
      expect(counts).to eq(quiet.id.to_s => 0, busy.id.to_s => 2)
    end

    it 'does not list a room I left' do
      room = attach(direct_status(me, partner))
      room.dm_room_members.find_by(account_id: me.id).hide!

      get '/api/v1/dm_rooms', headers: headers

      expect(response.parsed_body).to be_empty
    end

    # 차단·뮤트한 사람은 방을 만들고 메시지를 보낼 수는 있다(상류의 DM 과 같다). 하지만
    # 그 메시지가 목록 미리보기와 안 읽은 개수로 새어 나오면 차단이 무의미해진다.
    # 상류의 /conversations 는 이런 DM 을 아예 보여주지 않는다.
    context 'when a message comes from someone I block or mute' do
      it 'does not list a room whose only messages come from an account I block' do
        me.block!(partner)
        attach(direct_status(partner, me))

        get '/api/v1/dm_rooms', headers: headers

        expect(response.parsed_body).to be_empty
      end

      it 'does not list a room whose only messages come from an account I mute' do
        me.mute!(partner)
        attach(direct_status(partner, me))

        get '/api/v1/dm_rooms', headers: headers

        expect(response.parsed_body).to be_empty
      end

      it 'neither previews nor counts the blocked account in a room I still use' do
        room = attach(direct_status(me, partner))
        me.block!(partner)
        blocked = direct_status(partner, me, thread: room.last_status)
        attach(blocked)

        get '/api/v1/dm_rooms', headers: headers

        listed = response.parsed_body.find { |entry| entry['id'] == room.id.to_s }
        expect(listed['last_status']['id']).to_not eq blocked.id.to_s
        expect(listed['unread_count']).to eq 0
      end
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

    # 루트가 다른 방의 스레드를 가리키면 클라이언트가 거기에 답글을 달아 같은 사고를
    # 되풀이한다. 방을 여는 순간 바로잡는다. (DmRoom#heal_thread!)
    it "repairs a root that points into another room's thread" do
      group_root = direct_status(me, partner)
      group_root.mentions.create(account: stranger)
      attach(group_root)

      room  = DmRoom.find_or_create_for([me.id, partner.id])
      stray = direct_status(me, partner, thread: group_root)
      room.update_columns(last_status_id: stray.id, root_status_id: group_root.id)

      get "/api/v1/dm_rooms/#{room.id}", headers: headers

      expect(response).to have_http_status(200)
      expect(response.parsed_body['root_status_id']).to be_nil
    end

    # 나간 방도 URL 로 직접 열면 보여야 한다. 목록에만 없는 상태다. (FR-27)
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

    # 조회 시점 지연 귀속은 뒤늦게 발견한 과거 이력을 붙이는 것이다. 그것이 나간
    # 사람의 방을 되살리면, 아무도 말을 걸지 않았는데 방이 다시 나타난다. (FR-27)
    it 'does not resurrect a room I left when someone reads it' do
      first = direct_status(me, partner)
      room  = attach(first)

      delete "/api/v1/dm_rooms/#{room.id}", headers: headers

      # 아직 방에 붙지 않은 과거 conversation 을 하나 만든다.
      orphan = direct_status(partner, me)
      expect(orphan.conversation.reload.dm_room_id).to be_nil

      get "/api/v1/dm_rooms/#{room.id}/statuses", headers: headers
      get '/api/v1/dm_rooms', headers: headers

      expect(response.parsed_body).to be_empty
    end

    # 방에 다른 공개 범위의 글이 섞여 들어와도 나오면 안 된다.
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

    # 상한이 없으면 요청 하나로 인스턴스 전원에게 멤버 행을 만들 수 있다.
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

    # 다른 방의 id 를 넣으면 커서가 이 방보다 앞으로 밀려 배지가 영원히 0 이 된다.
    # 커서는 뒤로 가지 않으므로 되돌릴 방법도 없다.
    it 'rejects a status that does not belong to the room' do
      room  = attach(direct_status(me, partner))
      other = direct_status(partner, stranger)

      post "/api/v1/dm_rooms/#{room.id}/read", params: { status_id: other.id }, headers: headers

      expect(response).to have_http_status(422)
    end

    # 방을 열면 클라이언트는 last_status 의 id 를 보낸다. 그 글이 이 방의 conversation
    # 밖에 있어도 방의 머리이므로 받는다 — 막으면 방을 열 때마다 422 가 났다.
    it "accepts the room's own last status even when it sits outside the room" do
      group_root = direct_status(partner, me)
      group_root.mentions.create(account: stranger)
      attach(group_root)

      room  = DmRoom.find_or_create_for([me.id, partner.id])
      stray = direct_status(partner, me, thread: group_root)
      room.update_columns(last_status_id: stray.id)

      post "/api/v1/dm_rooms/#{room.id}/read", params: { status_id: stray.id }, headers: headers

      expect(response).to have_http_status(200)
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

    # 나간 방도 이력은 그대로 읽혀야 한다. 목록에만 없는 상태다.
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

    # 나간 뒤 상대가 말을 걸면 목록에 다시 나타나야 한다. (FR-27)
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
