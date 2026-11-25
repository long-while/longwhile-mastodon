# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Bookmark folder web route' do
  it 'serves the web app for a folder path' do
    sign_in Fabricate(:user)

    get '/bookmarks/123'

    expect(response).to have_http_status(200)
  end
end
