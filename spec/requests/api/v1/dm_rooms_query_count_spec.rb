# frozen_string_literal: true

require 'rails_helper'

# @_longwhile — DM 채팅의 목록·메시지 API 가 글마다 연관을 따로 읽지 않는지.
#   4.5~4.7 이 REST::StatusSerializer 에 인용(quote)·태그된 객체(tagged_objects)를 더해,
#   미리 읽지 않은 글 하나가 직렬화될 때 나가는 쿼리가 늘었다. 타임라인은 상류의
#   preload_collection 을 타지만 DM 쪽은 포크가 따로 만든 경로라 빠져 있었다.
#   (30개 한 페이지에 200 쿼리 넘게 나갔다.)
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
    get path, headers: headers # 첫 요청의 설정·캐시 조회는 세지 않는다
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
