# frozen_string_literal: true

require 'rails_helper'

# @_longwhile — 운영진의 DM 열람 기록이 /admin/action_logs 에 어떻게 보이는지.
#
#   기록 화면은 view_audit_log 권한(모더레이터 포함)이면 열리지만 DM 은
#   administrator·manage_roles 만 읽는다. 그래서 "누구와 누구의 대화인지" 는 DM 을
#   읽을 수 있는 사람에게만 보이고, 나머지에게는 방 번호만 보인다.
RSpec.describe 'Admin action logs' do
  let(:alice) { Fabricate(:account, username: 'alice') }
  let(:bob)   { Fabricate(:account, username: 'bob') }
  let(:staff) { Fabricate(:admin_user, account_attributes: { username: 'staffer' }) }

  let!(:room) do
    status = Fabricate(:status, account: alice, visibility: :direct, text: 'between us')
    status.mentions.create!(account: bob)
    DmRoom.attach_status!(status)
  end

  before { Admin::ActionLog.create!(account: staff.account, action: :view, target: room) }

  describe 'GET /admin/action_logs' do
    it 'shows a room view to someone who can read DMs, with its participants' do
      sign_in Fabricate(:admin_user)

      get admin_action_logs_path

      expect(response).to have_http_status(200)
      expect(response.body)
        .to include('대화방을 열람했습니다')
        .and include("##{room.id}")
        .and include('@alice')
        .and include('@bob')
        .and include("/messages/all/#{room.id}")
      expect(response.body).to_not include('between us')
    end

    it 'shows only the room number to staff who cannot read DMs' do
      sign_in Fabricate(:moderator_user)

      get admin_action_logs_path

      expect(response).to have_http_status(200)
      expect(response.body)
        .to include('대화방을 열람했습니다')
        .and include("##{room.id}")
      expect(response.body).to_not include('@alice')
      expect(response.body).to_not include("/messages/all/#{room.id}")
    end

    it 'filters by the room view action type' do
      Admin::ActionLog.create!(account: staff.account, action: :resolve, target: Fabricate(:report))
      sign_in Fabricate(:admin_user)

      get admin_action_logs_path(action_type: 'view_dm_room')

      expect(response.body).to include('대화방을 열람했습니다')
      expect(response.body).to_not include('신고를 해결로 변경하였습니다')
    end

    it 'still renders the entry after the room is gone' do
      room.destroy!
      sign_in Fabricate(:admin_user)

      get admin_action_logs_path

      expect(response).to have_http_status(200)
      expect(response.body).to include('대화방을 열람했습니다').and include('@alice')
    end

    it 'is not available to a regular user' do
      sign_in Fabricate(:user)

      get admin_action_logs_path

      expect(response).to have_http_status(403)
    end
  end
end
