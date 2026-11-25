# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'API V1 Bookmarks filters' do
  let(:user) { Fabricate(:user) }
  let(:account) { user.account }
  let(:token) { Fabricate(:accessible_access_token, resource_owner_id: user.id, scopes: 'read:bookmarks') }
  let(:headers) { { 'Authorization' => "Bearer #{token.token}" } }

  def bookmark(**status_attributes)
    Fabricate(:bookmark, account: account, status: Fabricate(:status, **status_attributes))
  end

  def listed_ids(params)
    get '/api/v1/bookmarks', headers: headers, params: params
    expect(response).to have_http_status(200)
    response.parsed_body.pluck(:id)
  end

  describe 'folder_id=none' do
    let(:folder) { Fabricate(:bookmark_folder, account: account) }
    let!(:filed) { bookmark }
    let!(:loose) { bookmark }

    before do
      BookmarkFolderItem.create!(bookmark_folder: folder, bookmark: filed)
      other_user_folder = Fabricate(:bookmark_folder)
      BookmarkFolderItem.create!(bookmark_folder: other_user_folder, bookmark: Fabricate(:bookmark, account: other_user_folder.account, status: loose.status))
    end

    it 'lists only bookmarks that are in none of my folders' do
      expect(listed_ids(folder_id: 'none')).to eq [loose.status_id.to_s]
    end

    it 'keeps the numeric folder filter working' do
      expect(listed_ids(folder_id: folder.id.to_s)).to eq [filed.status_id.to_s]
    end
  end

  describe 'q' do
    let!(:in_text) { bookmark(text: 'Hello World') }
    let!(:in_spoiler) { bookmark(text: 'nothing', spoiler_text: 'a WORLD inside') }
    let!(:in_note) { bookmark(text: 'nothing') }

    before do
      bookmark(text: 'nothing at all')
      in_note.update!(note: '나의 world 메모')
    end

    it 'matches text, spoiler text and the note case-insensitively' do
      expect(listed_ids(q: '  world ')).to contain_exactly(in_text.status_id.to_s, in_spoiler.status_id.to_s, in_note.status_id.to_s)
    end

    it 'ignores a blank query' do
      expect(listed_ids(q: '   ').size).to eq 4
    end

    it 'treats % and _ literally' do
      percent = bookmark(text: '100% sure')
      underscore = bookmark(text: 'snake_case')
      bookmark(text: '100 percent, snakeXcase')

      expect(listed_ids(q: '%')).to eq [percent.status_id.to_s]
      expect(listed_ids(q: '_')).to eq [underscore.status_id.to_s]
      expect(listed_ids(q: 'e_c')).to eq [underscore.status_id.to_s]
    end

    it 'caps the query at 100 characters' do
      long = bookmark(text: "#{'a' * 100}b")

      expect(listed_ids(q: "#{'a' * 100}zzz")).to eq [long.status_id.to_s]
    end

    it 'treats a backslash literally' do
      slash = bookmark(text: 'C:\path')

      expect(listed_ids(q: 'C:\p')).to eq [slash.status_id.to_s]
    end
  end

  describe 'only_media' do
    let!(:with_media) { bookmark }
    let!(:without_media) { bookmark }

    before { Fabricate(:media_attachment, account: with_media.status.account, status: with_media.status) }

    it 'lists only statuses with media' do
      expect(listed_ids(only_media: 'true')).to eq [with_media.status_id.to_s]
    end

    it 'does not filter with only_media=false' do
      expect(listed_ids(only_media: 'false')).to contain_exactly(with_media.status_id.to_s, without_media.status_id.to_s)
    end
  end

  describe 'account_id' do
    let(:author) { Fabricate(:account) }
    let!(:by_author) { bookmark(account: author) }

    before { bookmark }

    it 'lists only statuses by that account' do
      expect(listed_ids(account_id: author.id.to_s)).to eq [by_author.status_id.to_s]
    end

    it 'answers 404 for a malformed account_id', :aggregate_failures do
      ['account_id[]=1', 'account_id=abc', "account_id=#{author.id}x", 'account_id=99999999999999999999999'].each do |query|
        get "/api/v1/bookmarks?#{query}", headers: headers
        expect(response).to have_http_status(404), query
      end
    end
  end

  it 'combines the filters' do
    author = Fabricate(:account)
    folder = Fabricate(:bookmark_folder, account: account)
    hit = bookmark(account: author, text: 'cat picture')
    Fabricate(:media_attachment, account: author, status: hit.status)
    miss = bookmark(account: author, text: 'cat picture')
    Fabricate(:media_attachment, account: author, status: miss.status)
    BookmarkFolderItem.create!(bookmark_folder: folder, bookmark: miss)
    bookmark(account: author, text: 'dog picture')

    expect(listed_ids(folder_id: 'none', q: 'CAT', only_media: 'true', account_id: author.id.to_s)).to eq [hit.status_id.to_s]
  end

  it 'carries every filter in the pagination links' do
    author = Fabricate(:account)
    bookmarks = Array.new(3) { bookmark(account: author, text: 'match me') }
    bookmarks.each { |b| Fabricate(:media_attachment, account: author, status: b.status) }

    get '/api/v1/bookmarks', headers: headers, params: { folder_id: 'none', q: ' match ', only_media: '1', account_id: author.id.to_s, limit: 2 }

    filters = { limit: 2, folder_id: 'none', q: 'match', only_media: 'true', account_id: author.id.to_s }
    expect(response)
      .to include_pagination_headers(
        prev: api_v1_bookmarks_url(filters.merge(min_id: bookmarks.last.id)),
        next: api_v1_bookmarks_url(filters.merge(max_id: bookmarks.second.id))
      )
  end

  it 'leaves out filters that were not given' do
    Fabricate.times(2, :bookmark, account: account)

    get '/api/v1/bookmarks', headers: headers, params: { limit: 1, q: '' }

    expect(response.headers['Link'].to_s).to_not include('q=', 'folder_id', 'only_media', 'account_id')
  end
end
