# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'API V1 Bookmark Folders' do
  let(:user) { Fabricate(:user) }
  let(:account) { user.account }
  let(:scopes) { 'read:bookmarks write:bookmarks' }
  let(:token) { Fabricate(:accessible_access_token, resource_owner_id: user.id, scopes: scopes) }
  let(:headers) { { 'Authorization' => "Bearer #{token.token}" } }

  context 'without a token' do
    let(:headers) { {} }
    let!(:folder) { Fabricate(:bookmark_folder, account: account) }

    it 'answers 401 on every endpoint', :aggregate_failures do
      get '/api/v1/bookmark_folders', headers: headers
      expect(response).to have_http_status(401)

      post '/api/v1/bookmark_folders', headers: headers, params: { name: 'x' }
      expect(response).to have_http_status(401)

      put "/api/v1/bookmark_folders/#{folder.id}", headers: headers, params: { name: 'x' }
      expect(response).to have_http_status(401)

      put '/api/v1/bookmark_folders/order', headers: headers, params: { folder_ids: [folder.id.to_s] }, as: :json
      expect(response).to have_http_status(401)

      delete "/api/v1/bookmark_folders/#{folder.id}", headers: headers
      expect(response).to have_http_status(401)

      delete "/api/v1/bookmark_folders/#{folder.id}/statuses/1", headers: headers
      expect(response).to have_http_status(401)

      get '/api/v1/bookmarks', headers: headers
      expect(response).to have_http_status(401)

      expect(folder.reload.name).to_not eq 'x'
    end
  end

  context 'with a read-only token' do
    let(:scopes) { 'read:bookmarks' }
    let!(:folder) { Fabricate(:bookmark_folder, account: account, name: 'keep') }

    it 'answers 403 on writes and changes nothing', :aggregate_failures do
      put "/api/v1/bookmark_folders/#{folder.id}", headers: headers, params: { name: 'x' }
      expect(response).to have_http_status(403)

      put '/api/v1/bookmark_folders/order', headers: headers, params: { folder_ids: [folder.id.to_s] }, as: :json
      expect(response).to have_http_status(403)

      delete "/api/v1/bookmark_folders/#{folder.id}", headers: headers
      expect(response).to have_http_status(403)

      expect(folder.reload.name).to eq 'keep'
    end
  end

  describe 'GET /api/v1/bookmark_folders' do
    it 'lists all of my folders in order, with string ids' do
      second = Fabricate(:bookmark_folder, account: account, name: 'B')
      first = Fabricate(:bookmark_folder, account: account, name: 'A')
      BookmarkFolder.reorder!(account, [first.id, second.id])
      Fabricate(:bookmark_folder, name: 'not mine')

      get '/api/v1/bookmark_folders', headers: headers

      expect(response).to have_http_status(200)
      expect(response.parsed_body.pluck(:name)).to eq %w(A B)
      expect(response.parsed_body.first[:id]).to eq first.id.to_s
    end

    context 'with only a profile scope' do
      let(:scopes) { 'profile' }

      it 'is forbidden' do
        get '/api/v1/bookmark_folders', headers: headers

        expect(response).to have_http_status(403)
      end
    end
  end

  describe 'POST /api/v1/bookmark_folders' do
    it 'creates a folder at the end' do
      Fabricate(:bookmark_folder, account: account)

      post '/api/v1/bookmark_folders', headers: headers, params: { name: '읽을 것' }

      expect(response).to have_http_status(200)
      expect(response.parsed_body).to include(name: '읽을 것', position: 1)
    end

    it 'serializes the creation per account' do
      allow(BookmarkFolder).to receive(:create_for!).and_call_original

      post '/api/v1/bookmark_folders', headers: headers, params: { name: 'x' }

      expect(BookmarkFolder).to have_received(:create_for!).with(account, anything)
    end

    it 'trims invisible characters from the name' do
      post '/api/v1/bookmark_folders', headers: headers, params: { name: "\u3000\u200b읽을 것\u00a0" }

      expect(response).to have_http_status(200)
      expect(response.parsed_body[:name]).to eq '읽을 것'
    end

    it 'refuses a name made only of invisible characters' do
      post '/api/v1/bookmark_folders', headers: headers, params: { name: "\u3000\u00a0\u200b\ufeff" }

      expect(response).to have_http_status(422)
      expect(account.bookmark_folders).to be_empty
    end

    it 'refuses a blank or too long name' do
      post '/api/v1/bookmark_folders', headers: headers, params: { name: '' }
      expect(response).to have_http_status(422)

      post '/api/v1/bookmark_folders', headers: headers, params: { name: 'a' * 31 }
      expect(response).to have_http_status(422)
    end

    it 'refuses a folder over the limit' do
      stub_const('BookmarkFolder::PER_ACCOUNT_LIMIT', 1)
      Fabricate(:bookmark_folder, account: account)

      post '/api/v1/bookmark_folders', headers: headers, params: { name: 'one more' }

      expect(response).to have_http_status(422)
    end

    context 'with a read-only token' do
      let(:scopes) { 'read' }

      it 'is forbidden' do
        post '/api/v1/bookmark_folders', headers: headers, params: { name: 'x' }

        expect(response).to have_http_status(403)
      end
    end
  end

  describe 'PUT and DELETE /api/v1/bookmark_folders/:id' do
    let!(:folder) { Fabricate(:bookmark_folder, account: account, name: 'old') }
    let!(:other_folder) { Fabricate(:bookmark_folder, name: 'theirs') }

    it 'renames my folder' do
      put "/api/v1/bookmark_folders/#{folder.id}", headers: headers, params: { name: 'new' }

      expect(response).to have_http_status(200)
      expect(folder.reload.name).to eq 'new'
    end

    it 'deletes my folder but keeps the bookmarks' do
      bookmark = Fabricate(:bookmark, account: account)
      BookmarkFolderItem.create!(bookmark_folder: folder, bookmark: bookmark)

      delete "/api/v1/bookmark_folders/#{folder.id}", headers: headers

      expect(response).to have_http_status(200)
      expect(BookmarkFolder.exists?(folder.id)).to be(false)
      expect(Bookmark.exists?(bookmark.id)).to be(true)
    end

    it 'answers 404 for a folder of somebody else' do
      put "/api/v1/bookmark_folders/#{other_folder.id}", headers: headers, params: { name: 'mine now' }
      expect(response).to have_http_status(404)

      delete "/api/v1/bookmark_folders/#{other_folder.id}", headers: headers
      expect(response).to have_http_status(404)

      expect(other_folder.reload.name).to eq 'theirs'
    end
  end

  describe 'PUT /api/v1/bookmark_folders/order' do
    let!(:folders) { Fabricate.times(3, :bookmark_folder, account: account) }

    it 'reorders all of my folders' do
      put '/api/v1/bookmark_folders/order', headers: headers, params: { folder_ids: folders.reverse.map { |f| f.id.to_s } }, as: :json

      expect(response).to have_http_status(200)
      expect(response.parsed_body.pluck(:id)).to eq(folders.reverse.map { |f| f.id.to_s })
    end

    it 'answers 409 with a distinct message for a stale list and changes nothing', :aggregate_failures do
      stale_ids = folders.reverse.map { |f| f.id.to_s }
      Fabricate(:bookmark_folder, account: account)

      put '/api/v1/bookmark_folders/order', headers: headers, params: { folder_ids: stale_ids }, as: :json

      expect(response).to have_http_status(409)
      expect(response.parsed_body[:error]).to eq I18n.t('bookmark_folders.errors.stale_order', locale: :ko)
      expect(response.parsed_body[:error]).to_not eq I18n.t('bookmark_folders.errors.unknown_folder')
      expect(account.bookmark_folders.ordered.first(3).map(&:id)).to eq folders.map(&:id)
    end

    it 'answers 409 when a folder of the list was deleted in the meantime' do
      stale_ids = folders.map { |f| f.id.to_s }
      folders.last.destroy!

      put '/api/v1/bookmark_folders/order', headers: headers, params: { folder_ids: stale_ids }, as: :json

      expect(response).to have_http_status(409)
    end

    it 'answers 422 for repeated ids and for too many ids', :aggregate_failures do
      ids = folders.map { |f| f.id.to_s }

      put '/api/v1/bookmark_folders/order', headers: headers, params: { folder_ids: ids + [ids.first] }, as: :json
      expect(response).to have_http_status(422)

      put '/api/v1/bookmark_folders/order', headers: headers, params: { folder_ids: (1..51).map(&:to_s) }, as: :json
      expect(response).to have_http_status(422)
    end

    it 'does not take a folder of somebody else into the order' do
      foreign = Fabricate(:bookmark_folder)

      put '/api/v1/bookmark_folders/order', headers: headers, params: { folder_ids: folders.map { |f| f.id.to_s } + [foreign.id.to_s] }, as: :json

      expect(response).to have_http_status(409)
      expect(foreign.reload.position).to eq 0
    end

    it 'refuses a list that is not exactly my folders' do
      put '/api/v1/bookmark_folders/order', headers: headers, params: { folder_ids: 'nope' }, as: :json
      expect(response).to have_http_status(422)

      put '/api/v1/bookmark_folders/order', headers: headers, params: { folder_ids: [{}] }, as: :json
      expect(response).to have_http_status(422)
    end
  end

  describe 'DELETE /api/v1/bookmark_folders/:id/statuses/:status_id' do
    let(:folder) { Fabricate(:bookmark_folder, account: account) }
    let(:bookmark) { Fabricate(:bookmark, account: account) }

    it 'takes the status out of the folder and keeps the bookmark' do
      BookmarkFolderItem.create!(bookmark_folder: folder, bookmark: bookmark)

      delete "/api/v1/bookmark_folders/#{folder.id}/statuses/#{bookmark.status_id}", headers: headers

      expect(response).to have_http_status(200)
      expect(folder.bookmark_folder_items).to be_empty
      expect(Bookmark.exists?(bookmark.id)).to be(true)
    end

    it 'works even when the status can no longer be seen' do
      BookmarkFolderItem.create!(bookmark_folder: folder, bookmark: bookmark)
      bookmark.status.update!(visibility: :direct)

      delete "/api/v1/bookmark_folders/#{folder.id}/statuses/#{bookmark.status_id}", headers: headers

      expect(folder.bookmark_folder_items).to be_empty
    end
  end

  describe 'GET /api/v1/bookmarks?folder_id=' do
    let(:folder) { Fabricate(:bookmark_folder, account: account) }

    it 'lists only the bookmarks in that folder and keeps the folder in the paging links' do
      inside = Fabricate(:bookmark, account: account)
      Fabricate(:bookmark, account: account)
      BookmarkFolderItem.create!(bookmark_folder: folder, bookmark: inside)

      get '/api/v1/bookmarks', headers: headers, params: { folder_id: folder.id, limit: 1 }

      expect(response).to have_http_status(200)
      expect(response.parsed_body.pluck(:id)).to eq [inside.status_id.to_s]
      expect(response.headers['Link'].to_s).to include("folder_id=#{folder.id}")
    end

    it 'still lists every bookmark without a folder_id', :aggregate_failures do
      inside = Fabricate(:bookmark, account: account)
      outside = Fabricate(:bookmark, account: account)
      BookmarkFolderItem.create!(bookmark_folder: folder, bookmark: inside)

      get '/api/v1/bookmarks', headers: headers

      expect(response).to have_http_status(200)
      expect(response.parsed_body.pluck(:id)).to contain_exactly(inside.status_id.to_s, outside.status_id.to_s)

      get '/api/v1/bookmarks', headers: headers, params: { folder_id: '' }

      expect(response).to have_http_status(200)
      expect(response.parsed_body.size).to eq 2
    end

    it 'lists the bookmarks of a folder created through the fabricator' do
      item = Fabricate(:bookmark_folder_item, bookmark_folder: folder)

      get '/api/v1/bookmarks', headers: headers, params: { folder_id: folder.id.to_s }

      expect(response).to have_http_status(200)
      expect(response.parsed_body.pluck(:id)).to eq [item.bookmark.status_id.to_s]
    end

    it 'answers 404 and not 500 for a malformed folder_id', :aggregate_failures do
      ['folder_id[]=1', 'folder_id[a]=1', 'folder_id[]=', 'folder_id=abc', "folder_id=#{folder.id}x", 'folder_id=-1', 'folder_id=99999999999999999999999'].each do |query|
        get "/api/v1/bookmarks?#{query}", headers: headers

        expect(response).to have_http_status(404), "expected 404 for #{query}, got #{response.status}"
      end
    end

    it 'answers 404 for a folder of somebody else' do
      get '/api/v1/bookmarks', headers: headers, params: { folder_id: Fabricate(:bookmark_folder).id }

      expect(response).to have_http_status(404)
    end
  end
end
