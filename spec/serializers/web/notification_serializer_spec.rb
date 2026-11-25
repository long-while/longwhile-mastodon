# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Web::NotificationSerializer do
  subject(:payload) do
    described_class.new(notification, scope: subscription, scope_name: :current_push_subscription).as_json
  end

  let(:recipient) { Fabricate(:user) }
  let(:sender) { Fabricate(:account) }
  let(:session_token) { Fabricate(:access_token, resource_owner_id: recipient.id) }
  let(:subscription) { Fabricate(:web_push_subscription, user: recipient, access_token: session_token) }

  context 'with a direct message that belongs to a room' do
    let(:status) do
      Fabricate(:status, account: sender, visibility: :direct, text: 'psst').tap do |dm|
        dm.mentions.create!(account: recipient.account)
      end
    end
    let!(:room) { DmRoom.attach_status!(status) }
    let(:notification) { Fabricate(:notification, account: recipient.account, from_account: sender, activity: status.mentions.first, type: :mention) }

    it 'names the recipient account and the room' do
      expect(payload).to include(account_id: recipient.account_id.to_s, dm_room_id: room.id.to_s)
    end

    it 'marks it as direct' do
      expect(payload).to include(direct: true)
    end
  end

  context 'with a legacy direct message that has no room' do
    let(:status) do
      Fabricate(:status, account: sender, visibility: :direct, text: 'psst').tap do |dm|
        dm.mentions.create!(account: recipient.account)
      end
    end
    let(:notification) { Fabricate(:notification, account: recipient.account, from_account: sender, activity: status.mentions.first, type: :mention) }

    it 'has no room but is still marked as direct' do
      expect(payload).to include(dm_room_id: nil, direct: true)
    end
  end

  context 'with a public mention' do
    let(:status) do
      Fabricate(:status, account: sender, visibility: :public, text: 'hi').tap do |post|
        post.mentions.create!(account: recipient.account)
      end
    end
    let(:notification) { Fabricate(:notification, account: recipient.account, from_account: sender, activity: status.mentions.first, type: :mention) }

    it 'is not direct' do
      expect(payload).to include(direct: false)
    end
  end

  context 'with a notification without a status' do
    let(:notification) { Fabricate(:notification, account: recipient.account, from_account: sender, activity: Fabricate(:follow, account: sender, target_account: recipient.account), type: :follow) }

    it 'names the recipient account and no room' do
      expect(payload).to include(account_id: recipient.account_id.to_s, dm_room_id: nil, direct: false)
    end
  end
end
