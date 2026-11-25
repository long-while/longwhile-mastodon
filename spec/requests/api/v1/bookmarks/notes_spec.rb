# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'API V1 Bookmark notes' do
  let(:user) { Fabricate(:user) }
  let(:account) { user.account }
  let(:scopes) { 'read:bookmarks write:bookmarks' }
  let(:token) { Fabricate(:accessible_access_token, resource_owner_id: user.id, scopes: scopes) }
  let(:headers) { { 'Authorization' => "Bearer #{token.token}" } }
  let!(:bookmark) { Fabricate(:bookmark, account: account) }

  def put_note(status_id, note)
    put "/api/v1/bookmarks/#{status_id}/note", headers: headers, params: { note: note }, as: :json
  end

  it 'saves the note and answers the details', :aggregate_failures do
    folder = Fabricate(:bookmark_folder, account: account)
    BookmarkFolderItem.create!(bookmark_folder: folder, bookmark: bookmark)

    put_note(bookmark.status_id, '  다시 읽기  ')

    expect(response).to have_http_status(200)
    expect(response.parsed_body).to eq('status_id' => bookmark.status_id.to_s, 'note' => '다시 읽기', 'folder_ids' => [folder.id.to_s])
    expect(bookmark.reload.note).to eq '다시 읽기'
  end

  it 'clears the note when it is blank', :aggregate_failures do
    bookmark.update!(note: 'old')

    put_note(bookmark.status_id, " \u3000 ")

    expect(response).to have_http_status(200)
    expect(response.parsed_body[:note]).to eq ''
    expect(bookmark.reload.note).to be_nil
  end

  it 'clears the note when it is missing' do
    bookmark.update!(note: 'old')

    put "/api/v1/bookmarks/#{bookmark.status_id}/note", headers: headers, params: {}, as: :json

    expect(bookmark.reload.note).to be_nil
  end

  it 'accepts 500 characters and refuses 501 with a message', :aggregate_failures do
    put_note(bookmark.status_id, '가' * 500)
    expect(response).to have_http_status(200)

    put_note(bookmark.status_id, '가' * 501)
    expect(response).to have_http_status(422)
    expect(response.parsed_body[:error]).to eq I18n.t('bookmarks.errors.note_too_long', limit: 500, locale: :ko)
    expect(bookmark.reload.note).to eq '가' * 500
  end

  it 'refuses a note that is not text' do
    put_note(bookmark.status_id, { a: 1 })

    expect(response).to have_http_status(422)
  end

  it 'answers 404 for a status I did not bookmark', :aggregate_failures do
    others = Fabricate(:bookmark)

    put_note(others.status_id, 'x')
    expect(response).to have_http_status(404)
    expect(others.reload.note).to be_nil

    put_note(Fabricate(:status).id, 'x')
    expect(response).to have_http_status(404)

    put_note('abc', 'x')
    expect(response).to have_http_status(404)
  end

  it 'uses the original status for a reblog id', :aggregate_failures do
    reblog = Fabricate(:status, reblog: bookmark.status)

    put_note(reblog.id, 'via boost')

    expect(response).to have_http_status(200)
    expect(response.parsed_body[:status_id]).to eq bookmark.status_id.to_s
    expect(bookmark.reload.note).to eq 'via boost'
  end

  context 'with a read-only token' do
    let(:scopes) { 'read:bookmarks' }

    it 'answers 403 and changes nothing', :aggregate_failures do
      put_note(bookmark.status_id, 'x')

      expect(response).to have_http_status(403)
      expect(bookmark.reload.note).to be_nil
    end
  end
end
