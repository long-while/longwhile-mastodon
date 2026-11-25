# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Settings / Exports / Bookmark folders' do
  describe 'GET /settings/exports/bookmark_folders' do
    context 'with a signed in user who has filed bookmarks' do
      let(:user) { Fabricate(:user) }
      let(:status) { Fabricate(:status, account: Fabricate(:account, domain: 'foo.bar'), uri: 'https://foo.bar/statuses/1312') }

      before do
        folder = Fabricate(:bookmark_folder, account: user.account, name: '읽을 것')
        BookmarkFolderItem.create!(bookmark_folder: folder, bookmark: Fabricate(:bookmark, account: user.account, status: status))
        sign_in user
      end

      it 'returns a CSV of folder names and status URIs', :aggregate_failures do
        get '/settings/exports/bookmark_folders.csv'

        expect(response).to have_http_status(200)
        expect(response.content_type).to eq('text/csv')
        expect(response.headers['Content-Disposition']).to include('bookmark_folders.csv')
        expect(response.body).to eq("읽을 것,https://foo.bar/statuses/1312\n")
      end

      it 'leaves the bookmarks export format alone' do
        get '/settings/exports/bookmarks.csv'

        expect(response.body).to eq("https://foo.bar/statuses/1312\n")
      end

      it 'links the export from the export page', :aggregate_failures do
        get '/settings/export'

        expect(response).to have_http_status(200)
        expect(response.body).to include('/settings/exports/bookmark_folders.csv', I18n.t('exports.bookmark_folders', locale: :ko))
      end
    end

    context 'when signed out' do
      it 'returns unauthorized' do
        get '/settings/exports/bookmark_folders.csv'

        expect(response).to have_http_status(401)
      end
    end
  end
end
