# frozen_string_literal: true

require 'rails_helper'

# @_longwhile — "답장할 멘션" (/pending-mentions) 의 백엔드 계약.
#
#   이 화면은 서버에 전용 엔드포인트가 없다. 알림 그룹(/api/v2/notifications)을
#   받아서 프론트(selectors/notifications.ts 의 isAwaitingReply)가 거른다. 기준은
#   셋이다.
#
#     group.status_visibility    public 이 아니고 비어 있지 않을 것 (포크가 더한 필드)
#     status.replied             내가 아직 답하지 않았을 것 (포크가 더한 필드)
#     status.favourited          내가 마음에 들어요 하지 않았을 것
#
#   그래서 업스트림 머지가 serializer 에서 두 필드 중 하나만 떨어뜨려도 이 탭은
#   **오류 없이 조용히** 틀어진다 — 답한 멘션이 남거나, 모든 멘션이 사라진다.
RSpec.describe 'Pending mentions contract', :inline_jobs do
  let(:alice)   { Fabricate(:user, account_attributes: { username: 'alice' }) }
  let(:bob)     { Fabricate(:account, username: 'bob') }
  let(:token)   { Fabricate(:accessible_access_token, resource_owner_id: alice.id, scopes: 'read write') }
  let(:headers) { { 'Authorization' => "Bearer #{token.token}" } }

  # 공개 범위가 private 로 고정된 인스턴스다(PostStatusService). 멘션 알림이
  # 걸러지지 않도록 서로 팔로우한 사이로 둔다.
  before do
    alice.account.follow!(bob)
    bob.follow!(alice.account)
  end

  def mention_from_bob
    PostStatusService.new.call(bob, text: 'Hello @alice')
  end

  def notification_groups
    get '/api/v2/notifications', headers: headers, params: { types: ['mention'], exclude_direct_messages: true }

    expect(response).to have_http_status(200)
    response.parsed_body
  end

  def status_json(body, status)
    body[:statuses].find { |item| item[:id] == status.id.to_s }
  end

  describe 'GET /api/v2/notifications' do
    it 'labels each mention group with the visibility of its status' do
      status = mention_from_bob

      body  = notification_groups
      group = body[:notification_groups].sole

      expect(group).to include(type: 'mention', status_id: status.id.to_s, status_visibility: 'private')
    end

    it 'reports replied as false until I answer, then true' do
      status = mention_from_bob

      expect(status_json(notification_groups, status)).to include(replied: false, favourited: false)

      PostStatusService.new.call(alice.account, text: '@bob hi', thread: status)

      expect(status_json(notification_groups, status)).to include(replied: true)
    end

    it 'reports favourited once I like the mention' do
      status = mention_from_bob
      FavouriteService.new.call(alice.account, status)

      expect(status_json(notification_groups, status)).to include(favourited: true, replied: false)
    end

    it 'does not count somebody else answering as my reply' do
      status = mention_from_bob
      PostStatusService.new.call(bob, text: '@alice again', thread: status)

      expect(status_json(notification_groups, status)).to include(replied: false)
    end

    # 탈퇴(글을 남기고 나가기)는 정지가 아니라 anonymized_at 만 채운다. 컨트롤러의
    # without_suspended 로는 걸리지 않아 답장할 멘션에 "탈퇴한 사용자" 가 남던 것.
    it 'drops mentions from an account that left' do
      mention_from_bob
      bob.update!(anonymized_at: Time.now.utc)

      expect(notification_groups[:notification_groups]).to be_empty
    end
  end

  describe 'GET /api/v1/statuses/:id' do
    it 'carries replied for the signed-in reader' do
      status = mention_from_bob
      PostStatusService.new.call(alice.account, text: '@bob hi', thread: status)

      get "/api/v1/statuses/#{status.id}", headers: headers

      expect(response).to have_http_status(200)
      expect(response.parsed_body).to include(replied: true)
    end
  end

  describe 'GET /api/v1/timelines/home' do
    it 'carries replied on statuses rendered through the relationships presenter' do
      answered = PostStatusService.new.call(bob, text: 'first')
      pending  = PostStatusService.new.call(bob, text: 'second')
      PostStatusService.new.call(alice.account, text: '@bob reply', thread: answered)

      get '/api/v1/timelines/home', headers: headers

      expect(response).to have_http_status(200)
      body = response.parsed_body
      expect(body.find { |item| item[:id] == answered.id.to_s }).to include(replied: true)
      expect(body.find { |item| item[:id] == pending.id.to_s }).to include(replied: false)
    end
  end
end
