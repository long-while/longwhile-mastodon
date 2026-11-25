# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'API V1 Bookmark removals' do
  let(:user) { Fabricate(:user) }
  let(:account) { user.account }
  let(:scopes) { 'read:bookmarks write:bookmarks' }
  let(:token) { Fabricate(:accessible_access_token, resource_owner_id: user.id, scopes: scopes) }
  let(:headers) { { 'Authorization' => "Bearer #{token.token}" } }

  def remove(ids)
    post '/api/v1/bookmarks/remove', headers: headers, params: { status_ids: ids.map(&:to_s) }, as: :json
  end

  it 'removes my bookmarks and their folder items and answers what it removed', :aggregate_failures do
    folder = Fabricate(:bookmark_folder, account: account)
    first, second, kept = Fabricate.times(3, :bookmark, account: account)
    BookmarkFolderItem.create!(bookmark_folder: folder, bookmark: first)
    others = Fabricate(:bookmark)

    remove([first.status_id, second.status_id, others.status_id, Fabricate(:status).id])

    expect(response).to have_http_status(200)
    expect(response.parsed_body[:status_ids]).to contain_exactly(first.status_id.to_s, second.status_id.to_s)
    expect(account.bookmarks.reload).to eq [kept]
    expect(Bookmark.exists?(others.id)).to be true
    expect(BookmarkFolderItem.count).to eq 0
    expect(folder.reload).to be_persisted
  end

  it 'runs the record callbacks (the cleanup policy forgets the unbookmarked status)' do
    status = Fabricate(:status, account: account)
    Fabricate(:bookmark, account: account, status: status)
    policy = Fabricate(:account_statuses_cleanup_policy, account: account, keep_self_bookmark: true)
    policy.record_last_inspected(status.id + 1)

    remove([status.id])

    expect(response).to have_http_status(200)
    expect(policy.last_inspected).to eq status.id
  end

  it 'answers an empty list for an empty request' do
    remove([])

    expect(response).to have_http_status(200)
    expect(response.parsed_body[:status_ids]).to eq []
  end

  it 'refuses more than 40 ids and removes nothing', :aggregate_failures do
    bookmark = Fabricate(:bookmark, account: account)

    remove([bookmark.status_id] + (1..40).to_a)

    expect(response).to have_http_status(422)
    expect(Bookmark.exists?(bookmark.id)).to be true
  end

  it 'refuses a malformed list' do
    post '/api/v1/bookmarks/remove', headers: headers, params: { status_ids: [{}] }, as: :json

    expect(response).to have_http_status(422)
  end

  context 'with a read-only token' do
    let(:scopes) { 'read:bookmarks' }

    it 'answers 403 and removes nothing', :aggregate_failures do
      bookmark = Fabricate(:bookmark, account: account)

      remove([bookmark.status_id])

      expect(response).to have_http_status(403)
      expect(Bookmark.exists?(bookmark.id)).to be true
    end
  end
end
