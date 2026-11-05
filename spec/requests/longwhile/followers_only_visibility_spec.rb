# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Followers-only visibility' do
  let(:author_user) { Fabricate(:user) }
  let(:author)      { author_user.account }
  let(:follower)    { Fabricate(:user).account }
  let(:stranger)    { Fabricate(:user).account }

  def headers_for(account)
    token = Fabricate(:accessible_access_token, resource_owner_id: account.user.id, scopes: 'read write')
    { 'Authorization' => "Bearer #{token.token}" }
  end

  before { follower.follow!(author) }

  describe 'POST /api/v1/statuses' do
    def post_with(account, visibility)
      post '/api/v1/statuses', headers: headers_for(account), params: { status: 'hello', visibility: visibility }.compact
      expect(response).to have_http_status(200)
      response.parsed_body[:visibility]
    end

    it 'turns public and unlisted into private for a regular account' do
      expect(post_with(author, 'public')).to eq 'private'
      expect(post_with(author, 'unlisted')).to eq 'private'
      expect(post_with(author, nil)).to eq 'private'
    end

    it 'keeps direct' do
      expect(post_with(author, 'direct')).to eq 'direct'
    end

    it 'lets only the announcement account post unlisted' do
      announcer = Fabricate(:user).account
      announcer.update_columns(username: PublicFeed::ANNOUNCEMENT_USERNAME)

      expect(post_with(announcer, 'unlisted')).to eq 'unlisted'
      expect(post_with(announcer, 'public')).to eq 'private'
    end
  end

  describe 'GET /api/v1/statuses/:id' do
    def status_code_for(account, status)
      get "/api/v1/statuses/#{status.id}", headers: headers_for(account)
      response.status
    end

    it 'shows a private post to followers only' do
      status = Fabricate(:status, account: author, visibility: :private)

      expect(status_code_for(follower, status)).to eq 200
      expect(status_code_for(stranger, status)).to eq 404
    end

    it 'treats an unlisted post like a private one' do
      status = Fabricate(:status, account: author, visibility: :unlisted)

      expect(status_code_for(follower, status)).to eq 200
      expect(status_code_for(stranger, status)).to eq 404
    end

    it 'still shows a post to someone it mentions' do
      status = Fabricate(:status, account: author, visibility: :private)
      status.mentions.create!(account: stranger)

      expect(status_code_for(stranger, status)).to eq 200
    end
  end

  describe 'boosts of private posts' do
    let(:booster) { Fabricate(:user).account }
    let(:viewer)  { Fabricate(:user).account }
    let(:original) { Fabricate(:status, account: author, visibility: :private) }

    let(:reblog) { boost_through_api }

    def boost_through_api
      booster.follow!(author)
      post "/api/v1/statuses/#{original.id}/reblog", headers: headers_for(booster)
      Status.find(response.parsed_body[:id])
    end

    it 'lets a follower boost a private post by someone else' do
      expect(reblog.reblog_of_id).to eq original.id
      expect(response).to have_http_status(200)
    end

    it 'hides the boost from someone who follows only the booster' do
      viewer.follow!(booster)

      get "/api/v1/statuses/#{reblog.id}", headers: headers_for(viewer)

      expect(response).to have_http_status(404)
    end

    it 'shows the boost to someone who follows both' do
      viewer.follow!(booster)
      viewer.follow!(author)

      get "/api/v1/statuses/#{reblog.id}", headers: headers_for(viewer)

      expect(response).to have_http_status(200)
    end

    it "keeps the boost out of the booster's profile for someone who does not follow the author" do
      viewer.follow!(booster)
      reblog

      get "/api/v1/accounts/#{booster.id}/statuses", headers: headers_for(viewer)

      expect(response.parsed_body.pluck(:id)).to_not include(reblog.id.to_s)
    end
  end

  describe 'GET /api/v1/accounts/:id/statuses' do
    let!(:private_post)  { Fabricate(:status, account: author, visibility: :private) }
    let!(:unlisted_post) { Fabricate(:status, account: author, visibility: :unlisted) }

    it 'lists private and unlisted posts for a follower' do
      get "/api/v1/accounts/#{author.id}/statuses", headers: headers_for(follower)

      expect(response.parsed_body.pluck(:id)).to contain_exactly(private_post.id.to_s, unlisted_post.id.to_s)
    end

    it 'lists only the posts that mention a stranger' do
      mentioning = Fabricate(:status, account: author, visibility: :private)
      mentioning.mentions.create!(account: stranger)

      get "/api/v1/accounts/#{author.id}/statuses", headers: headers_for(stranger)

      expect(response.parsed_body.pluck(:id)).to eq [mentioning.id.to_s]
    end
  end
end
