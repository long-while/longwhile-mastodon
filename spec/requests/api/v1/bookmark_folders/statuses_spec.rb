# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'API V1 Bookmark folder statuses' do
  let(:user) { Fabricate(:user) }
  let(:account) { user.account }
  let(:scopes) { 'read:bookmarks write:bookmarks' }
  let(:token) { Fabricate(:accessible_access_token, resource_owner_id: user.id, scopes: scopes) }
  let(:headers) { { 'Authorization' => "Bearer #{token.token}" } }
  let!(:folder) { Fabricate(:bookmark_folder, account: account) }

  def add(ids, target = folder)
    post "/api/v1/bookmark_folders/#{target.id}/statuses", headers: headers, params: { status_ids: ids.map(&:to_s) }, as: :json
  end

  def take_out(ids, target = folder)
    delete "/api/v1/bookmark_folders/#{target.id}/statuses", headers: headers, params: { status_ids: ids.map(&:to_s) }, as: :json
  end

  def filed_status_ids(target = folder)
    target.bookmark_folder_items.joins(:bookmark).pluck('bookmarks.status_id')
  end

  describe 'POST' do
    it 'files my existing bookmarks and skips everything else', :aggregate_failures do
      first, second = Fabricate.times(2, :bookmark, account: account)
      others = Fabricate(:bookmark)
      not_bookmarked = Fabricate(:status)

      add([first.status_id, second.status_id, others.status_id, not_bookmarked.id])

      expect(response).to have_http_status(200)
      expect(response.parsed_body[:status_ids]).to contain_exactly(first.status_id.to_s, second.status_id.to_s)
      expect(filed_status_ids).to contain_exactly(first.status_id, second.status_id)
      expect(account.bookmarks.where(status: not_bookmarked)).to_not exist
      expect(others.bookmark_folder_items).to be_empty
    end

    it 'is idempotent and answers what is already in the folder', :aggregate_failures do
      bookmark = Fabricate(:bookmark, account: account)
      add([bookmark.status_id])
      add([bookmark.status_id, bookmark.status_id])

      expect(response).to have_http_status(200)
      expect(response.parsed_body[:status_ids]).to eq [bookmark.status_id.to_s]
      expect(BookmarkFolderItem.count).to eq 1
    end

    it 'does not file a DM that only staff can read' do
      owner_user = Fabricate(:owner_user)
      owner_token = Fabricate(:accessible_access_token, resource_owner_id: owner_user.id, scopes: 'write:bookmarks')
      owner_folder = Fabricate(:bookmark_folder, account: owner_user.account)
      dm = Fabricate(:status, visibility: :direct)
      Fabricate(:bookmark, account: owner_user.account, status: dm)

      post "/api/v1/bookmark_folders/#{owner_folder.id}/statuses", headers: { 'Authorization' => "Bearer #{owner_token.token}" }, params: { status_ids: [dm.id.to_s] }, as: :json

      expect(response.parsed_body[:status_ids]).to eq []
      expect(owner_folder.bookmark_folder_items).to be_empty
    end

    it 'answers 404 for somebody else\'s folder' do
      bookmark = Fabricate(:bookmark, account: account)

      add([bookmark.status_id], Fabricate(:bookmark_folder))

      expect(response).to have_http_status(404)
      expect(BookmarkFolderItem.count).to eq 0
    end

    it 'refuses more than 40 ids' do
      add((1..41).to_a)

      expect(response).to have_http_status(422)
    end

    it 'refuses a malformed list' do
      post "/api/v1/bookmark_folders/#{folder.id}/statuses", headers: headers, params: { status_ids: 'nope' }, as: :json

      expect(response).to have_http_status(422)
    end
  end

  describe 'DELETE' do
    let!(:filed) { Fabricate.times(3, :bookmark, account: account) }

    before { filed.each { |bookmark| BookmarkFolderItem.create!(bookmark_folder: folder, bookmark: bookmark) } }

    it 'takes the statuses out of the folder and keeps the bookmarks', :aggregate_failures do
      loose = Fabricate(:bookmark, account: account)

      take_out([filed.first.status_id, filed.second.status_id, loose.status_id])

      expect(response).to have_http_status(200)
      expect(response.parsed_body[:status_ids]).to contain_exactly(filed.first.status_id.to_s, filed.second.status_id.to_s)
      expect(filed_status_ids).to eq [filed.third.status_id]
      expect(account.bookmarks.count).to eq 4
    end

    it 'takes out a status I can no longer see' do
      dm = Fabricate(:status, visibility: :direct)
      bookmark = Fabricate(:bookmark, account: account, status: dm)
      BookmarkFolderItem.create!(bookmark_folder: folder, bookmark: bookmark)

      take_out([dm.id])

      expect(response.parsed_body[:status_ids]).to eq [dm.id.to_s]
    end

    it 'leaves the same bookmark in my other folders alone' do
      other_folder = Fabricate(:bookmark_folder, account: account)
      BookmarkFolderItem.create!(bookmark_folder: other_folder, bookmark: filed.first)

      take_out([filed.first.status_id])

      expect(filed_status_ids(other_folder)).to eq [filed.first.status_id]
    end

    it 'answers 404 for somebody else\'s folder and changes nothing' do
      foreign = Fabricate(:bookmark_folder)
      foreign_bookmark = Fabricate(:bookmark, account: foreign.account)
      BookmarkFolderItem.create!(bookmark_folder: foreign, bookmark: foreign_bookmark)

      take_out([foreign_bookmark.status_id], foreign)

      expect(response).to have_http_status(404)
      expect(foreign.bookmark_folder_items.count).to eq 1
    end

    it 'refuses more than 40 ids and changes nothing', :aggregate_failures do
      take_out([filed.first.status_id] + (1..40).to_a)

      expect(response).to have_http_status(422)
      expect(folder.bookmark_folder_items.count).to eq 3
    end

    it 'keeps the single remove_status route working' do
      delete "/api/v1/bookmark_folders/#{folder.id}/statuses/#{filed.first.status_id}", headers: headers

      expect(response).to have_http_status(200)
      expect(filed_status_ids).to contain_exactly(filed.second.status_id, filed.third.status_id)
    end
  end

  context 'with a read-only token' do
    let(:scopes) { 'read:bookmarks' }

    it 'answers 403 on both and changes nothing', :aggregate_failures do
      bookmark = Fabricate(:bookmark, account: account)

      add([bookmark.status_id])
      expect(response).to have_http_status(403)

      take_out([bookmark.status_id])
      expect(response).to have_http_status(403)

      expect(BookmarkFolderItem.count).to eq 0
    end
  end
end
