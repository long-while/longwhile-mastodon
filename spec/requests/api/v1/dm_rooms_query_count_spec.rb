# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'API V1 DM rooms query count' do
  let(:user)    { Fabricate(:user) }
  let(:me)      { user.account }
  let(:partner) { Fabricate(:account) }
  let(:token)   { Fabricate(:accessible_access_token, resource_owner_id: user.id, scopes: 'read:statuses') }
  let(:headers) { { 'Authorization' => "Bearer #{token.token}" } }

  before { allow(Mastodon::DmChat).to receive(:enabled?).and_return(true) }

  describe 'GET /api/v1/dm_rooms/:id/statuses' do
    it 'does not grow with the number of messages on the page' do
      root = direct_status(me, partner)
      room = DmRoom.attach_status!(root)
      path = "/api/v1/dm_rooms/#{room.id}/statuses"

      add_messages(root, 5)
      few = query_count(path)

      add_messages(root, 15)
      many = query_count(path)

      expect(response.parsed_body.size).to eq 21
      expect(many).to be <= few + 2
    end
  end

  describe 'GET /api/v1/dm_rooms' do
    it 'does not grow with the number of rooms on the page' do
      add_rooms(5)
      few = query_count('/api/v1/dm_rooms')

      add_rooms(10)
      many = query_count('/api/v1/dm_rooms')

      expect(response.parsed_body.size).to eq 15
      expect(many).to be <= few + 2
    end
  end

  private

  def query_count(path)
    get path, headers: headers
    expect(response).to have_http_status(200)

    count = 0
    counter = lambda do |*, payload|
      next if payload[:cached] || %w(SCHEMA TRANSACTION).include?(payload[:name])

      count += 1
    end
    ActiveSupport::Notifications.subscribed(counter, 'sql.active_record') { get path, headers: headers }
    count
  end

  def add_messages(root, count)
    count.times do |i|
      author, recipient = i.even? ? [partner, me] : [me, partner]
      status = direct_status(author, recipient, thread: root)
      Fabricate(:media_attachment, account: author, status: status) if (i % 3).zero?
      DmRoom.attach_status!(status)
    end
  end

  def add_rooms(count)
    count.times do |i|
      status = direct_status(Fabricate(:account), me)
      Fabricate(:media_attachment, account: status.account, status: status) if i.even?
      DmRoom.attach_status!(status)
    end
  end

  def direct_status(author, recipient, thread: nil)
    status = Fabricate(:status, account: author, visibility: :direct, thread: thread, text: "@#{recipient.username} hi")
    status.mentions.create(account: recipient)
    status
  end
end
