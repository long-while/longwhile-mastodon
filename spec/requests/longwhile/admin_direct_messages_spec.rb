# frozen_string_literal: true

require 'rails_helper'

# @_longwhile — 전체 DM(운영진 열람). 두 화면이 같은 권한을 쓴다.
#
#     /messages/all          웹 채팅 화면의 읽기 전용 모드 → /api/v1/admin/dm_rooms
#     /admin/direct_messages  Rails 가 그리는 운영 화면
#
#   권한은 Admin::DirectMessagePolicy(administrator 또는 manage_roles) 하나다.
#   모더레이터는 신고를 처리하지만 DM 을 읽지 못한다. 업스트림 머지가 정책이나
#   역할 권한을 건드리면 이 경계가 조용히 넓어질 수 있어서 역할마다 확인한다.
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

  # 웹 채팅 화면이 쓰는 웹 UI(superapp) 토큰으로 부른다. 이 API 는 웹 UI 토큰이나
  # admin:read 토큰만 받는다(관리자가 read 로 승인한 외부 앱이 DM 을 읽지 못하게).
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

    # 운영진 화면은 일부러 다른 serializer 를 쓴다. 사용자 것을 쓰면 전원의 읽음 상태와
    # 각자 지정한 별명이 운영진에게 실린다.
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
