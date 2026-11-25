# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'API V1 Bookmarks details' do
  let(:user) { Fabricate(:user) }
  let(:account) { user.account }
  let(:scopes) { 'read:bookmarks' }
  let(:token) { Fabricate(:accessible_access_token, resource_owner_id: user.id, scopes: scopes) }
  let(:headers) { { 'Authorization' => "Bearer #{token.token}" } }

  def get_details(ids)
    get '/api/v1/bookmarks/details', headers: headers, params: { status_ids: ids.map(&:to_s) }
  end

  it 'gives the note and folders of my bookmarks and leaves out the rest', :aggregate_failures do
    folder_a = Fabricate(:bookmark_folder, account: account)
    folder_b = Fabricate(:bookmark_folder, account: account)
    noted = Fabricate(:bookmark, account: account, note: '메모')
    plain = Fabricate(:bookmark, account: account)
    BookmarkFolderItem.create!(bookmark_folder: folder_b, bookmark: noted)
    BookmarkFolderItem.create!(bookmark_folder: folder_a, bookmark: noted)
    others = Fabricate(:bookmark)
    not_bookmarked = Fabricate(:status)

    get_details([noted.status_id, plain.status_id, others.status_id, not_bookmarked.id])

    expect(response).to have_http_status(200)
    expect(response.parsed_body).to contain_exactly(
      { status_id: noted.status_id.to_s, note: '메모', folder_ids: [folder_a.id.to_s, folder_b.id.to_s] },
      { status_id: plain.status_id.to_s, note: '', folder_ids: [] }
    )
  end

  it 'gives the details of a bookmark I can no longer see' do
    dm = Fabricate(:status, visibility: :direct)
    Fabricate(:bookmark, account: account, status: dm)

    get_details([dm.id])

    expect(response.parsed_body.pluck(:status_id)).to eq [dm.id.to_s]
  end

  it 'answers an empty list without ids' do
    get '/api/v1/bookmarks/details', headers: headers

    expect(response).to have_http_status(200)
    expect(response.parsed_body).to eq []
  end

  it 'refuses more than 40 ids' do
    get_details((1..41).to_a)

    expect(response).to have_http_status(422)
    expect(response.parsed_body[:error]).to be_present
  end

  it 'accepts exactly 40 ids' do
    get_details((1..40).to_a)

    expect(response).to have_http_status(200)
  end

  it 'refuses a malformed list', :aggregate_failures do
    ['status_ids=1', 'status_ids[]=abc', 'status_ids[a]=1'].each do |query|
      get "/api/v1/bookmarks/details?#{query}", headers: headers
      expect(response).to have_http_status(422), query
    end
  end

  it 'reads the folders without a query per bookmark' do
    folder = Fabricate(:bookmark_folder, account: account)
    bookmarks = Fabricate.times(5, :bookmark, account: account)
    bookmarks.each { |b| BookmarkFolderItem.create!(bookmark_folder: folder, bookmark: b) }

    queries = lambda do |ids|
      capture_notifications('sql.active_record') { get_details(ids) }.count { |event| event.payload[:sql].include?('bookmark') }
    end

    expect(queries.call([bookmarks.first.status_id])).to eq queries.call(bookmarks.map(&:status_id))
    expect(response.parsed_body.size).to eq 5
  end

  context 'without the read scope' do
    let(:scopes) { 'write:bookmarks' }

    it 'answers 403' do
      get_details([1])

      expect(response).to have_http_status(403)
    end
  end

  context 'without a token' do
    let(:headers) { {} }

    it 'answers 401' do
      get_details([1])

      expect(response).to have_http_status(401)
    end
  end
end
