# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'GET /api/v1/statuses/:id for announcements' do
  let(:announcer) do
    Fabricate.build(:account, username: PublicFeed::ANNOUNCEMENT_USERNAME).tap { |account| account.save!(validate: false) }
  end
  let(:announcement) { Fabricate(:status, account: announcer, visibility: :unlisted) }
  let(:user) { Fabricate(:user) }
  let(:token) { Fabricate(:accessible_access_token, resource_owner_id: user.id, scopes: 'read:statuses') }
  let(:headers) { { 'Authorization' => "Bearer #{token.token}" } }

  it 'returns the announcement to a logged-in account that does not follow it' do
    get "/api/v1/statuses/#{announcement.id}", headers: headers

    expect(response).to have_http_status(200)
    expect(response.parsed_body[:id]).to eq announcement.id.to_s
  end

  it 'still returns 404 for an unlisted status of another account' do
    old_unlisted = Fabricate(:status, visibility: :unlisted)

    get "/api/v1/statuses/#{old_unlisted.id}", headers: headers

    expect(response).to have_http_status(404)
  end

  context 'without a token' do
    it 'returns 404 when unauthenticated API access is allowed' do
      get "/api/v1/statuses/#{announcement.id}"

      expect(response).to have_http_status(404)
    end

    it 'returns 401 in limited federation mode' do
      original = Rails.configuration.x.mastodon.limited_federation_mode
      Rails.configuration.x.mastodon.limited_federation_mode = true

      get "/api/v1/statuses/#{announcement.id}"

      expect(response).to have_http_status(401)
    ensure
      Rails.configuration.x.mastodon.limited_federation_mode = original
    end

    it 'returns 401 when unauthenticated API access is disallowed' do
      ClimateControl.modify DISALLOW_UNAUTHENTICATED_API_ACCESS: 'true' do
        get "/api/v1/statuses/#{announcement.id}"
      end

      expect(response).to have_http_status(401)
    end
  end
end
