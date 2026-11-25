# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'API V1 Bookmark authors' do
  let(:user) { Fabricate(:user) }
  let(:account) { user.account }
  let(:token) { Fabricate(:accessible_access_token, resource_owner_id: user.id, scopes: 'read:bookmarks') }
  let(:headers) { { 'Authorization' => "Bearer #{token.token}" } }

  def bookmark_by(author)
    Fabricate(:bookmark, account: account, status: Fabricate(:status, account: author))
  end

  def author_ids
    get '/api/v1/bookmarks/authors', headers: headers
    expect(response).to have_http_status(200)
    response.parsed_body.pluck(:id)
  end

  it 'lists the authors I bookmarked, most bookmarked first', :aggregate_failures do
    once = Fabricate(:account)
    thrice = Fabricate(:account)
    twice = Fabricate(:account)
    bookmark_by(once)
    3.times { bookmark_by(thrice) }
    2.times { bookmark_by(twice) }
    Fabricate(:bookmark, status: Fabricate(:status, account: Fabricate(:account)))

    expect(author_ids).to eq([thrice, twice, once].map { |a| a.id.to_s })
    expect(response.parsed_body.first).to include(:username, :acct, :avatar)
  end

  it 'breaks ties by the latest bookmark' do
    older = Fabricate(:account)
    newer = Fabricate(:account)
    bookmark_by(older)
    bookmark_by(newer)

    expect(author_ids).to eq([newer, older].map { |a| a.id.to_s })
  end

  it 'does not count statuses that are gone' do
    gone = Fabricate(:account)
    bookmark_by(gone).status.discard
    kept = Fabricate(:account)
    bookmark_by(kept)

    expect(author_ids).to eq [kept.id.to_s]
  end

  it 'gives at most 40 authors' do
    41.times { bookmark_by(Fabricate(:account)) }

    expect(author_ids.size).to eq 40
  end

  context 'without a token' do
    let(:headers) { {} }

    it 'answers 401' do
      get '/api/v1/bookmarks/authors', headers: headers

      expect(response).to have_http_status(401)
    end
  end
end
