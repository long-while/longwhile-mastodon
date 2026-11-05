# frozen_string_literal: true

require 'rails_helper'

# @_longwhile — v4.5 의 인용이 이 포크의 팔로워 전용 모델에서 비공개 글을 새게 하지 않는지 본다
# (위험 지도 .claude/upgrade/logs/v4.5.x.md §2.4).
RSpec.describe 'Quotes and follower-only posts' do
  let(:author) { Fabricate(:account) }
  let(:follower) { Fabricate(:user).account }
  let(:stranger) { Fabricate(:user).account }
  let(:private_status) { PostStatusService.new.call(author, text: 'follower-only original') }

  before { follower.follow!(author) }

  def headers_for(account, scopes = 'read write')
    token = Fabricate(:accessible_access_token, resource_owner_id: account.user.id, scopes: scopes)
    { 'Authorization' => "Bearer #{token.token}" }
  end

  it 'posts everything as private, so the policy of an ordinary post is nobody' do
    expect(private_status).to be_private_visibility
    expect(private_status.quote_approval_policy).to eq(0)
  end

  describe 'quoting someone else\'s follower-only post' do
    it 'is refused even for a follower' do
      post '/api/v1/statuses', headers: headers_for(follower), params: { status: 'quoting', quoted_status_id: private_status.id }

      expect(response).to have_http_status(404)
      expect(Quote.where(quoted_status: private_status)).to be_empty
    end
  end

  describe 'a self-quote that mentions someone who does not follow the author' do
    let!(:quoting_status) do
      PostStatusService.new.call(author, text: "@#{stranger.acct} look at this", quoted_status: private_status)
    end

    it 'lets the mentioned person see the post but not the quoted original' do
      get "/api/v1/statuses/#{quoting_status.id}", headers: headers_for(stranger, 'read')

      expect(response).to have_http_status(200)
      expect(response.parsed_body[:quote]).to include(state: 'unauthorized', quoted_status: nil)
      expect(response.body).to_not include('follower-only original')
    end
  end

  describe 'quoting the announcement account' do
    # 예약된 아이디라 검증을 건너뛰고 만든다(운영에서는 관리자가 만든 계정이다).
    let(:announcer) { Fabricate.build(:account, username: PublicFeed::ANNOUNCEMENT_USERNAME).tap { |account| account.save!(validate: false) } }
    let(:announcement) do
      PostStatusService.new.call(announcer, text: 'notice', visibility: 'unlisted', quote_approval_policy: InteractionPolicy::POLICY_FLAGS[:public] << 16)
    end

    # 공지 계정의 unlisted 는 로그인한 누구에게나 보이는 공지다(StatusPolicy#show? 의 announcement? 갈래).
    # 그래서 공지 계정을 팔로우하지 않은 사람도 인용할 수 있다.
    it 'is allowed, because its unlisted posts are the only quotable ones' do
      post '/api/v1/statuses', headers: headers_for(stranger), params: { status: 'quoting the notice', quoted_status_id: announcement.id }

      expect(response).to have_http_status(200)
      expect(response.parsed_body[:quote]).to include(state: 'accepted')
    end
  end
end
