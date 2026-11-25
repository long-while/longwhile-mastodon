# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'API V1 Statuses Bookmark Folders' do
  let(:user) { Fabricate(:user) }
  let(:account) { user.account }
  let(:token) { Fabricate(:accessible_access_token, resource_owner_id: user.id, scopes: 'read:bookmarks write:bookmarks') }
  let(:headers) { { 'Authorization' => "Bearer #{token.token}" } }
  let(:status) { Fabricate(:status) }
  let!(:folder_a) { Fabricate(:bookmark_folder, account: account, name: 'A') }
  let!(:folder_b) { Fabricate(:bookmark_folder, account: account, name: 'B') }

  def put_folders(target, ids)
    put "/api/v1/statuses/#{target.id}/bookmark_folders", headers: headers, params: { folder_ids: ids.map(&:to_s) }, as: :json
  end

  context 'without a token' do
    let(:headers) { {} }

    it 'answers 401 and bookmarks nothing', :aggregate_failures do
      put_folders(status, [folder_a.id])
      expect(response).to have_http_status(401)

      get "/api/v1/statuses/#{status.id}/bookmark_folders", headers: headers
      expect(response).to have_http_status(401)

      expect(Bookmark.count).to eq 0
    end
  end

  context 'with a token without write:bookmarks' do
    let(:token) { Fabricate(:accessible_access_token, resource_owner_id: user.id, scopes: 'read:bookmarks') }

    it 'answers 403 on PUT and bookmarks nothing', :aggregate_failures do
      put_folders(status, [folder_a.id])

      expect(response).to have_http_status(403)
      expect(Bookmark.count).to eq 0
      expect(BookmarkFolderItem.count).to eq 0
    end

    it 'still lets it read' do
      get "/api/v1/statuses/#{status.id}/bookmark_folders", headers: headers

      expect(response).to have_http_status(200)
    end
  end

  it 'bookmarks the status and files it in the chosen folders' do
    put_folders(status, [folder_a.id, folder_b.id])

    expect(response).to have_http_status(200)
    expect(response.parsed_body[:folder_ids]).to contain_exactly(folder_a.id.to_s, folder_b.id.to_s)
    expect(response.parsed_body.dig(:status, :bookmarked)).to be(true)
    expect(account.bookmarks.where(status: status)).to exist
  end

  it 'replaces the set of folders' do
    put_folders(status, [folder_a.id, folder_b.id])
    put_folders(status, [folder_b.id])

    expect(response.parsed_body[:folder_ids]).to eq [folder_b.id.to_s]

    get "/api/v1/statuses/#{status.id}/bookmark_folders", headers: headers
    expect(response.parsed_body[:folder_ids]).to eq [folder_b.id.to_s]
  end

  it 'takes it out of every folder but keeps the bookmark when the set is empty' do
    put_folders(status, [folder_a.id])
    put_folders(status, [])

    expect(response.parsed_body[:folder_ids]).to eq []
    expect(account.bookmarks.where(status: status)).to exist
  end

  it 'refuses a folder of somebody else and changes nothing' do
    put_folders(status, [folder_a.id, Fabricate(:bookmark_folder).id])

    expect(response).to have_http_status(422)
    expect(account.bookmarks.where(status: status)).to_not exist
  end

  it 'refuses folder ids that are not ids' do
    put "/api/v1/statuses/#{status.id}/bookmark_folders", headers: headers, params: { folder_ids: [{}] }, as: :json

    expect(response).to have_http_status(422)
  end

  it 'is idempotent when the same set is sent twice' do
    2.times { put_folders(status, [folder_a.id]) }

    expect(response).to have_http_status(200)
    expect(BookmarkFolderItem.count).to eq 1
  end

  it 'answers 409 when the bookmark vanishes while filing' do
    allow(BookmarkFolderItem).to receive(:insert_all).and_raise(ActiveRecord::InvalidForeignKey)

    put_folders(status, [folder_a.id])

    expect(response).to have_http_status(409)
  end

  it 'files the original status when given a boost' do
    boost = Fabricate(:status, reblog: status)

    put_folders(boost, [folder_a.id])

    expect(response).to have_http_status(200)
    expect(account.bookmarks.pluck(:status_id)).to eq [status.id]
  end

  it 'answers 404 for a private status of somebody I do not follow and bookmarks nothing' do
    private_status = Fabricate(:status, visibility: :private)

    put_folders(private_status, [folder_a.id])

    expect(response).to have_http_status(404)
    expect(account.bookmarks).to be_empty
  end

  it 'answers 404 for a status by an author who blocks me and bookmarks nothing' do
    author = Fabricate(:account)
    Fabricate(:block, account: author, target_account: account)
    blocked_status = Fabricate(:status, account: author)

    put_folders(blocked_status, [folder_a.id])

    expect(response).to have_http_status(404)
    expect(account.bookmarks).to be_empty
    expect(BookmarkFolderItem.count).to eq 0
  end

  it 'answers 404 for a status that does not exist' do
    put '/api/v1/statuses/0/bookmark_folders', headers: headers, params: { folder_ids: [folder_a.id.to_s] }, as: :json

    expect(response).to have_http_status(404)
  end

  it 'answers 404 for a direct message I am not part of' do
    dm = Fabricate(:status, visibility: :direct)

    put_folders(dm, [folder_a.id])

    expect(response).to have_http_status(404)
    expect(account.bookmarks).to be_empty
  end

  it 'does not let staff file somebody else\'s DM even though they can read it' do
    owner_user = Fabricate(:owner_user)
    owner_token = Fabricate(:accessible_access_token, resource_owner_id: owner_user.id, scopes: 'read:bookmarks write:bookmarks')
    owner_folder = Fabricate(:bookmark_folder, account: owner_user.account)
    dm = Fabricate(:status, visibility: :direct)

    put "/api/v1/statuses/#{dm.id}/bookmark_folders", headers: { 'Authorization' => "Bearer #{owner_token.token}" }, params: { folder_ids: [owner_folder.id.to_s] }, as: :json

    expect(response).to have_http_status(404)
    expect(owner_user.account.bookmarks).to be_empty
  end

  it 'lists only my folders for the status' do
    put_folders(status, [folder_a.id])
    other = Fabricate(:user)
    other_folder = Fabricate(:bookmark_folder, account: other.account)
    BookmarkFolderItem.create!(bookmark_folder: other_folder, bookmark: Fabricate(:bookmark, account: other.account, status: status))

    get "/api/v1/statuses/#{status.id}/bookmark_folders", headers: headers

    expect(response.parsed_body[:folder_ids]).to eq [folder_a.id.to_s]
  end

  it 'drops the folder items when the filed status is destroyed' do
    put_folders(status, [folder_a.id, folder_b.id])
    expect(BookmarkFolderItem.count).to eq 2

    status.destroy!

    expect(Bookmark.count).to eq 0
    expect(BookmarkFolderItem.count).to eq 0
    expect([folder_a, folder_b].map { |folder| BookmarkFolder.exists?(folder.id) }).to eq [true, true]
  end

  it 'reads the folders of a bookmark made through the fabricator' do
    item = Fabricate(:bookmark_folder_item, bookmark_folder: folder_a)

    get "/api/v1/statuses/#{item.bookmark.status_id}/bookmark_folders", headers: headers

    expect(response.parsed_body[:folder_ids]).to eq [folder_a.id.to_s]
  end

  it 'drops the folder items when the bookmark is removed' do
    put_folders(status, [folder_a.id])

    post "/api/v1/statuses/#{status.id}/unbookmark", headers: headers

    expect(BookmarkFolderItem.count).to eq 0
    expect(folder_a.reload).to be_persisted
  end

  describe 'the staff DM view log' do
    let(:dm_reader) { Fabricate(:user, role: Fabricate(:user_role, permissions: UserRole::FLAGS[:view_direct_messages])) }
    let(:reader_token) { Fabricate(:accessible_access_token, resource_owner_id: dm_reader.id, scopes: 'read:bookmarks write:bookmarks') }
    let(:reader_headers) { { 'Authorization' => "Bearer #{reader_token.token}" } }
    let(:dm) { Fabricate(:status, visibility: :direct) }

    it 'writes no log row for a 404', :aggregate_failures do
      get "/api/v1/statuses/#{dm.id}/bookmark_folders", headers: reader_headers
      expect(response).to have_http_status(404)

      put "/api/v1/statuses/#{dm.id}/bookmark_folders", headers: reader_headers, params: { folder_ids: [] }, as: :json
      expect(response).to have_http_status(404)

      expect(Admin::ActionLog.where(account: dm_reader.account, action: 'view')).to be_empty
    end

    it 'still logs the same read through another status path' do
      get "/api/v1/statuses/#{dm.id}/favourited_by", headers: reader_headers

      expect(Admin::ActionLog.where(account: dm_reader.account, action: 'view', target: dm)).to exist
    end

    it 'answers a DM that mentions the reader without a log row' do
      mentioned = Fabricate(:status, visibility: :direct)
      Fabricate(:mention, status: mentioned, account: dm_reader.account)

      get "/api/v1/statuses/#{mentioned.id}/bookmark_folders", headers: reader_headers

      expect(response).to have_http_status(200)
      expect(Admin::ActionLog.where(account: dm_reader.account, action: 'view')).to be_empty
    end
  end
end
