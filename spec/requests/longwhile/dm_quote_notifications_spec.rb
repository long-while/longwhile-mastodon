# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Quote notifications of direct messages', :inline_jobs do
  let(:user)              { Fabricate(:user) }
  let(:headers)           { auth_headers(user) }
  let(:announcer_user)    { Fabricate(:user).tap { |u| u.account.update_columns(username: PublicFeed::ANNOUNCEMENT_USERNAME) } }
  let(:announcer_headers) { auth_headers(announcer_user) }
  let(:web_params)        { { exclude_direct_messages: true } }

  let!(:notice) do
    post '/api/v1/statuses', headers: announcer_headers, params: { status: 'notice', visibility: 'unlisted', quote_approval_policy: 'public' }
    Status.find(response.parsed_body[:id])
  end

  before do
    allow(Mastodon::DmChat).to receive(:enabled?).and_return(true)

    post '/api/v1/statuses', headers: headers, params: { status: "@#{PublicFeed::ANNOUNCEMENT_USERNAME} about this", visibility: 'direct', quoted_status_id: notice.id }
  end

  def auth_headers(owner)
    { 'Authorization' => "Bearer #{Fabricate(:accessible_access_token, resource_owner_id: owner.id, scopes: 'read write').token}" }
  end

  it 'keeps the quote of a DM out of the quoted account notification list', :aggregate_failures do
    expect(Notification.where(account: announcer_user.account, type: :quote)).to exist

    get '/api/v2/notifications', headers: announcer_headers, params: web_params
    expect(response.parsed_body[:notification_groups]).to be_empty

    get '/api/v1/notifications/unread_count', headers: announcer_headers, params: web_params
    expect(response.parsed_body[:count]).to eq 0
  end

  it 'keeps the update of a quoted post out of the DM author notification list', :aggregate_failures do
    put "/api/v1/statuses/#{notice.id}", headers: announcer_headers, params: { status: 'notice, edited' }
    expect(Notification.where(account: user.account, type: :quoted_update)).to exist

    get '/api/v2/notifications', headers: headers, params: web_params
    expect(response.parsed_body[:notification_groups]).to be_empty
  end

  it 'still delivers them to clients that ask for direct messages' do
    get '/api/v2/notifications', headers: announcer_headers

    expect(response.parsed_body[:notification_groups].pluck(:type)).to include('quote')
  end
end
