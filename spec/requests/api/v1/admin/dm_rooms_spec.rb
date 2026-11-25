# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'API V1 Admin DM rooms' do
  let(:admin)    { Fabricate(:admin_user) }
  let(:web_app)  { Doorkeeper::Application.create!(name: 'Web', redirect_uri: 'urn:ietf:wg:oauth:2.0:oob', scopes: 'read write follow push', superapp: true) }
  let(:token)    { Fabricate(:accessible_access_token, application: web_app, resource_owner_id: admin.id, scopes: 'read write follow') }
  let(:headers)  { { 'Authorization' => "Bearer #{token.token}" } }
  let(:alice)    { Fabricate(:account) }
  let(:bob)      { Fabricate(:account) }
  let!(:room)    { DmRoom.attach_status!(direct_status(alice, bob)) }

  before { allow(Mastodon::DmChat).to receive(:enabled?).and_return(true) }

  shared_examples 'readable only through the web interface or an admin scope' do
    it 'serves the web interface token of an administrator' do
      subject

      expect(response).to have_http_status(200)
    end

    it 'serves an administrator token that holds admin:read' do
      admin_token = Fabricate(:accessible_access_token, application: Fabricate(:application, scopes: 'read admin:read'), resource_owner_id: admin.id, scopes: 'read admin:read')
      headers['Authorization'] = "Bearer #{admin_token.token}"

      subject

      expect(response).to have_http_status(200)
    end

    it 'refuses a third-party application token of an administrator' do
      third_party = Fabricate(:accessible_access_token, application: Fabricate(:application, scopes: 'read'), resource_owner_id: admin.id, scopes: 'read')
      headers['Authorization'] = "Bearer #{third_party.token}"

      subject

      expect(response).to have_http_status(403)
      expect(response.body).to_not include(room.last_status.text)
    end

    it 'refuses a user who is not an administrator' do
      user_token = Fabricate(:accessible_access_token, application: web_app, resource_owner_id: Fabricate(:user).id, scopes: 'read write follow')
      headers['Authorization'] = "Bearer #{user_token.token}"

      subject

      expect(response).to have_http_status(403)
    end

    it 'refuses the web interface token of a disabled administrator' do
      admin.update!(disabled: true)

      subject

      expect(response).to have_http_status(403)
      expect(response.body).to_not include(room.last_status.text)
    end

    it 'refuses an admin:read token of a disabled administrator' do
      admin.update!(disabled: true)
      admin_token = Fabricate(:accessible_access_token, application: Fabricate(:application, scopes: 'read admin:read'), resource_owner_id: admin.id, scopes: 'read admin:read')
      headers['Authorization'] = "Bearer #{admin_token.token}"

      subject

      expect(response).to have_http_status(403)
      expect(response.body).to_not include(room.last_status.text)
    end
  end

  describe 'GET /api/v1/admin/dm_rooms' do
    subject { get '/api/v1/admin/dm_rooms', headers: headers }

    it_behaves_like 'readable only through the web interface or an admin scope'
  end

  describe 'GET /api/v1/admin/dm_rooms/:id' do
    subject { get "/api/v1/admin/dm_rooms/#{room.id}", headers: headers }

    it_behaves_like 'readable only through the web interface or an admin scope'
  end

  describe 'GET /api/v1/admin/dm_rooms/:id/statuses' do
    subject { get "/api/v1/admin/dm_rooms/#{room.id}/statuses", headers: headers }

    it_behaves_like 'readable only through the web interface or an admin scope'
  end

  describe 'the audit trail of staff opening a room' do
    let(:viewer) { admin.account }

    def view_room(target = room, params = {})
      get "/api/v1/admin/dm_rooms/#{target.id}/statuses", headers: headers, params: params
    end

    def view_logs
      Admin::ActionLog.where(action: 'view', target_type: 'DmRoom')
    end

    it 'records who opened which room, naming the participants but not the messages' do
      expect { view_room }.to change(view_logs, :count).by(1)

      log = view_logs.last
      expect(log).to have_attributes(account: viewer, target: room)
      expect(log.human_identifier).to include("@#{alice.acct}", "@#{bob.acct}")
      expect(log.human_identifier).to_not include('secret')
    end

    it 'does not record the older pages or a reopen within the window' do
      view_room

      expect do
        view_room(room, max_id: room.last_status_id)
        travel_to(Admin::DmRoomViewLog::WINDOW.from_now - 1.minute) { view_room }
      end.to_not change(view_logs, :count)
    end

    it 'records again once the window has passed' do
      view_room

      travel_to(Admin::DmRoomViewLog::WINDOW.from_now + 1.minute) do
        expect { view_room }.to change(view_logs, :count).by(1)
      end
    end

    it 'records each room and each staff member separately' do
      other_room = DmRoom.attach_status!(direct_status(bob, Fabricate(:account)))
      other_admin = Fabricate(:admin_user)
      other_token = Fabricate(:accessible_access_token, application: web_app, resource_owner_id: other_admin.id, scopes: 'read write follow')

      view_room
      view_room(other_room)
      get "/api/v1/admin/dm_rooms/#{room.id}/statuses", headers: { 'Authorization' => "Bearer #{other_token.token}" }

      expect(view_logs.pluck(:account_id, :target_id))
        .to contain_exactly([viewer.id, room.id], [viewer.id, other_room.id], [other_admin.account_id, room.id])
    end

    it 'records opening the room list as a list view, which carries no message bodies' do
      expect { get '/api/v1/admin/dm_rooms', headers: headers }.to_not change(view_logs, :count)
      expect(Admin::ActionLog.where(action: 'search_direct_messages', account: viewer)).to exist

      expect(response.body).to_not include('secret')
      expect(response.parsed_body.first[:last_status]).to include(content: '', redacted: true)
      expect(response.parsed_body.first.dig(:last_status, :account, :id)).to eq alice.id.to_s
    end

    it 'records opening the room details' do
      expect { get "/api/v1/admin/dm_rooms/#{room.id}", headers: headers }.to change(view_logs, :count).by(1)

      expect(response.body).to_not include('secret')
    end

    it 'does not record a refused request' do
      user_token = Fabricate(:accessible_access_token, application: web_app, resource_owner_id: Fabricate(:user).id, scopes: 'read write follow')
      headers['Authorization'] = "Bearer #{user_token.token}"

      expect { view_room }.to_not change(Admin::ActionLog, :count)
      expect(response).to have_http_status(403)
    end
  end

  def direct_status(author, recipient)
    status = Fabricate(:status, account: author, visibility: :direct, text: 'secret between two people')
    status.mentions.create(account: recipient)
    status
  end
end
