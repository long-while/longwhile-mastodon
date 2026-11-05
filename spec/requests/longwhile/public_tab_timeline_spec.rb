# frozen_string_literal: true

require 'rails_helper'

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
