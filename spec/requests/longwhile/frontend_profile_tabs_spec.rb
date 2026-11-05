# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Profile tabs as the frozen web frontend requests them' do
  let(:author)   { Fabricate(:user).account }
  let(:follower) { Fabricate(:user).account }
  let(:token)    { Fabricate(:accessible_access_token, resource_owner_id: follower.user.id, scopes: 'read') }
  let(:headers)  { { 'Authorization' => "Bearer #{token.token}" } }

  let!(:post_status)  { PostStatusService.new.call(author, text: '그냥 글 #태그') }
  let!(:reply_status) do
    friend = Fabricate(:account)
    author.follow!(friend)
    PostStatusService.new.call(author, text: '답글', thread: PostStatusService.new.call(friend, text: '친구 글'))
  end
  let!(:media_status) do
    media = Fabricate(:media_attachment, account: author)
    PostStatusService.new.call(author, text: '사진', media_ids: [media.id.to_s])
  end

  before do
    follower.follow!(author)
    StatusPin.create!(account: author, status: post_status)
  end

  def ids_for(params)
    get "/api/v1/accounts/#{author.id}/statuses", headers: headers, params: params

    expect(response).to have_http_status(200)
    response.parsed_body.pluck(:id)
  end

  it 'shows posts without replies on the posts tab' do
    expect(ids_for(exclude_replies: true, exclude_reblogs: false))
      .to contain_exactly(post_status.id.to_s, media_status.id.to_s)
  end

  it 'shows replies too on the posts-and-replies tab' do
    expect(ids_for(exclude_replies: false, exclude_reblogs: true))
      .to contain_exactly(post_status.id.to_s, reply_status.id.to_s, media_status.id.to_s)
  end

  it 'shows only media on the media tab' do
    expect(ids_for(only_media: true, limit: 40)).to eq [media_status.id.to_s]
  end

  it 'shows the followers-only pinned post on the featured tab' do
    expect(ids_for(pinned: true)).to eq [post_status.id.to_s]
    expect(response.parsed_body.first).to include(visibility: 'private')
  end

  it 'filters the featured and posts tabs by a featured hashtag' do
    expect(ids_for(pinned: true, tagged: '태그')).to eq [post_status.id.to_s]
    expect(ids_for(exclude_replies: true, exclude_reblogs: false, tagged: '태그')).to eq [post_status.id.to_s]
  end
end
