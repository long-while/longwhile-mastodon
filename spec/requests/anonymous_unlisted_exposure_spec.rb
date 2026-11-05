# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Anonymous access to unlisted statuses' do
  let(:account) { Fabricate(:account, username: 'alice') }
  let!(:unlisted_status) { Fabricate(:status, account: account, visibility: :unlisted, text: 'unlisted secret') }
  let!(:public_status) { Fabricate(:status, account: account, visibility: :public, text: 'public hello') }

  it 'keeps unlisted statuses out of the account RSS feed' do
    get '/@alice.rss'

    expect(response).to have_http_status(200)
    expect(response.body).to include('public hello')
    expect(response.body).to_not include('unlisted secret')
  end

  it 'lists a pinned unlisted status in the featured collection only by its URI' do
    StatusPin.create!(account: account, status: unlisted_status)

    get '/users/alice/collections/featured', headers: { 'Accept' => 'application/activity+json' }

    expect(response).to have_http_status(200)
    expect(response.body).to_not include('unlisted secret')
  end

  it 'keeps unlisted replies out of the replies collection' do
    Fabricate(:status, account: account, thread: public_status, visibility: :unlisted, text: 'unlisted reply')

    get "/users/alice/statuses/#{public_status.id}/replies", params: { page: true }, headers: { 'Accept' => 'application/activity+json' }

    expect(response).to have_http_status(200)
    expect(response.body).to_not include('unlisted reply')
  end
end
