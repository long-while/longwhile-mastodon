# frozen_string_literal: true

require 'rails_helper'

# @_longwhile — 홈/퍼블릭 탭의 "퍼블릭" (/public). 웹은
#   GET /api/v1/timelines/public?remote=false&only_media=false 를 부른다
#   (features/firehose, actions/timelines.js 의 expandPublicTimeline). 옛 주소 /local
#   은 같은 API 에 local=true 를 붙인다.
#
#   이 피드는 이름과 달리 "내가 팔로우하는 사람(과 나, 공지 계정)의 글" 이다.
#   규칙은 PublicFeed#standard_public_scope 에 있고, 실시간 갱신은 프론트의
#   acceptsIntoPublicTootTimeline(actions/streaming.js) 이 **같은 규칙**을 다시 건다.
#
#   조건들은 원시 SQL 로 적혀 있다. merge! 가 같은 컬럼의 앞 조건을 지우기 때문이다
#   (CLAUDE.md "피드의 보안 조건"). 여기서는 그 결과를 API 로 본다 — 모델 스펙
#   (spec/models/public_feed_spec.rb 의 the followed-authors filter)과 짝이다.
RSpec.describe 'Public tab timeline' do
  let(:viewer_user) { Fabricate(:user) }
  let(:viewer)      { viewer_user.account }
  let(:followed)    { Fabricate(:account) }
  let(:stranger)    { Fabricate(:account) }
  let(:token)       { Fabricate(:accessible_access_token, resource_owner_id: viewer_user.id, scopes: 'read:statuses') }
  let(:headers)     { { 'Authorization' => "Bearer #{token.token}" } }

  before { viewer.follow!(followed) }

  def public_tab_ids(params = { remote: false, only_media: false })
    get '/api/v1/timelines/public', headers: headers, params: params
    expect(response).to have_http_status(200)
    response.parsed_body.pluck(:id)
  end

  def private_status(account, **attributes)
    Fabricate(:status, account: account, visibility: :private, **attributes)
  end

  it 'shows followed authors and the viewer, and hides strangers' do
    from_followed = private_status(followed)
    own           = private_status(viewer)
    from_stranger = private_status(stranger)

    ids = public_tab_ids

    expect(ids).to include(from_followed.id.to_s, own.id.to_s)
    expect(ids).to_not include(from_stranger.id.to_s)
  end

  it 'applies the same rules to the local variant' do
    from_followed = private_status(followed)
    from_stranger = private_status(stranger)

    ids = public_tab_ids(local: true)

    expect(ids).to include(from_followed.id.to_s)
    expect(ids).to_not include(from_stranger.id.to_s)
  end

  it 'shows the announcement account without following it' do
    announcer = Fabricate(:account)
    announcer.update_columns(username: PublicFeed::ANNOUNCEMENT_USERNAME)
    announcement = Fabricate(:status, account: announcer, visibility: :unlisted)

    expect(public_tab_ids).to include(announcement.id.to_s)
  end

  it 'leaves out posts that mention anyone, but keeps a self-thread' do
    mentioning = private_status(followed)
    mentioning.mentions.create!(account: stranger)
    thread_start = private_status(followed)
    self_reply   = private_status(followed, thread: thread_start)

    ids = public_tab_ids

    expect(ids).to_not include(mentioning.id.to_s)
    expect(ids).to include(self_reply.id.to_s)
  end

  it 'never shows direct messages' do
    message = Fabricate(:status, account: followed, visibility: :direct)

    expect(public_tab_ids).to_not include(message.id.to_s)
  end

  it "shows a followed booster's boost only when the original author is followed too" do
    other_followed = Fabricate(:account)
    viewer.follow!(other_followed)

    followed.follow!(other_followed)
    followed.follow!(stranger)
    visible_boost = ReblogService.new.call(followed, private_status(other_followed))
    hidden_boost  = ReblogService.new.call(followed, private_status(stranger))

    ids = public_tab_ids

    expect(ids).to include(visible_boost.id.to_s)
    expect(ids).to_not include(hidden_boost.id.to_s)
  end

  # merge! 가 팔로우 필터를 지우던 회귀. 차단 목록이 비어 있지 않을 때 Arel 노드가 달라진다.
  it 'still hides strangers when the viewer has blocked someone' do
    viewer.block!(Fabricate(:account))
    from_stranger = private_status(stranger)

    expect(public_tab_ids).to_not include(from_stranger.id.to_s)
  end

  it 'gives a signed-out request nothing' do
    private_status(followed)

    get '/api/v1/timelines/public', params: { remote: false, only_media: false }

    expect(response.parsed_body).to eq []
  end
end
