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

  describe 'the view_direct_messages permission' do
    let(:roles_only) { Fabricate(:user, role: Fabricate(:user_role, permissions: UserRole::FLAGS[:manage_roles])) }
    let(:dm_reader) { Fabricate(:user, role: Fabricate(:user_role, permissions: UserRole::FLAGS[:view_direct_messages])) }

    it 'is no longer implied by managing roles' do
      get '/api/v1/admin/dm_rooms', headers: headers_for(roles_only)
      expect(response).to have_http_status(403)

      get "/api/v1/statuses/#{message.id}", headers: headers_for(roles_only)
      expect(response).to have_http_status(404)

      sign_in roles_only
      get '/admin/direct_messages'
      expect(response).to have_http_status(403)
    end

    it 'opens the DM screens on its own' do
      get '/api/v1/admin/dm_rooms', headers: headers_for(dm_reader)
      expect(response).to have_http_status(200)

      get "/api/v1/statuses/#{message.id}", headers: headers_for(dm_reader)
      expect(response).to have_http_status(200)
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

    describe 'the audit trail' do
      let(:owner) { Fabricate(:owner_user) }

      def status_view_logs
        Admin::ActionLog.where(action: 'view', target_type: 'Status')
      end

      def room_view_logs
        Admin::ActionLog.where(action: 'view', target_type: 'DmRoom')
      end

      it 'records a staff member opening somebody else\'s DM as a view of its room, once per window' do
        headers = headers_for(owner)

        expect do
          get "/api/v1/statuses/#{message.id}", headers: headers
          get "/api/v1/statuses/#{message.id}/context", headers: headers
        end.to change(room_view_logs, :count).by(1)

        expect(room_view_logs.last).to have_attributes(account: owner.account, target: room)
        expect(status_view_logs).to be_empty
      end

      it 'records every DM that belongs to no room, with no per-request cap' do
        loose = Array.new(8) { Fabricate(:status, account: alice, visibility: :direct, text: 'loose') }

        get '/api/v1/statuses', params: { id: loose.map(&:id) }, headers: headers_for(owner)

        expect(response).to have_http_status(200)
        expect(status_view_logs.pluck(:target_id)).to match_array(loose.map(&:id))
      end

      it 'does not look up the role when no status has a hidden visibility' do
        public_status = Fabricate(:status, account: alice, visibility: :public)
        account = owner.account
        user = account.user
        allow(user).to receive(:can?).and_call_original

        Admin::DirectMessageViewLog.log_status_views!(account, [public_status])

        expect(user).to_not have_received(:can?)
      end

      it 'does not record a staff member reading a DM they took part in' do
        own_dm = Fabricate(:status, account: owner.account, visibility: :direct, text: 'mine')

        expect { get "/api/v1/statuses/#{own_dm.id}", headers: headers_for(owner) }.to_not change(status_view_logs, :count)
      end

      it 'does not record public posts' do
        public_status = Fabricate(:status, account: alice, visibility: :public)

        expect { get "/api/v1/statuses/#{public_status.id}", headers: headers_for(owner) }.to_not change(status_view_logs, :count)
      end
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

    it 'records opening the list, once per window and query' do
      admin = Fabricate(:admin_user)
      sign_in admin

      expect do
        get '/admin/direct_messages'
        get '/admin/direct_messages'
        get '/admin/direct_messages', params: { q: 'between' }
      end.to change(Admin::ActionLog.where(action: 'search_direct_messages'), :count).by(2)

      travel_to(Admin::DirectMessageViewLog::WINDOW.from_now + 1.minute) do
        expect { get '/admin/direct_messages' }.to change(Admin::ActionLog.where(action: 'search_direct_messages'), :count).by(1)
      end
    end

    it 'records the search query and logs once per (account, query)' do
      sign_in Fabricate(:admin_user)
      logs = Admin::ActionLog.where(action: 'search_direct_messages')

      expect do
        get '/admin/direct_messages', params: { q: 'between' }
        get '/admin/direct_messages', params: { q: 'between', page: 2 }
        get '/admin/direct_messages', params: { q: 'other' }
        get '/admin/direct_messages'
      end.to change(logs, :count).by(3)

      expect(logs.pluck(:route_param)).to contain_exactly('between', 'other', nil)
      expect(logs.find_by(route_param: 'between').permalink).to eq '/admin/direct_messages?q=between'
    end

    it 'shows the query on the audit log page to a DM reader only' do
      admin = Fabricate(:admin_user)
      sign_in admin
      get '/admin/direct_messages', params: { q: 'secretword' }

      get '/admin/action_logs'

      expect(response.body).to include('secretword')
    end

    it 'renders the audit log entries' do
      admin = Fabricate(:admin_user)
      sign_in admin
      get '/admin/direct_messages'
      get "/api/v1/statuses/#{message.id}", headers: headers_for(admin)

      get '/admin/action_logs'

      expect(response).to have_http_status(200)
      expect(response.body).to include('운영 화면에서 DM 목록을 열람했습니다', '대화방을 열람했습니다')
    end
  end
end
