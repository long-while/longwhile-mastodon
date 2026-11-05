# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Scheduled posts' do
  let(:user)    { Fabricate(:user) }
  let(:token)   { Fabricate(:accessible_access_token, resource_owner_id: user.id, scopes: 'read write') }
  let(:headers) { { 'Authorization' => "Bearer #{token.token}" } }

  it 'schedules through POST /api/v1/statuses and lists the post with its failure fields' do
    scheduled_at = 2.hours.from_now.change(usec: 0)

    post '/api/v1/statuses', headers: headers, params: { status: '나중에', scheduled_at: scheduled_at.iso8601 }

    expect(response).to have_http_status(200)
    expect(response.parsed_body[:id]).to be_present
    expect(Time.zone.parse(response.parsed_body[:scheduled_at])).to eq scheduled_at
    expect(response.parsed_body.dig(:params, :text)).to eq '나중에'
    expect(Status.where(account: user.account)).to be_empty

    get '/api/v1/scheduled_statuses', headers: headers

    expect(response.parsed_body.sole).to include(failed_at: nil, last_error: nil)
  end

  it 'reports a failed post with its reason' do
    scheduled = Fabricate(:scheduled_status, account: user.account)
    scheduled.update_columns(failed_at: Time.now.utc, last_error: 'rate limited')

    get '/api/v1/scheduled_statuses', headers: headers

    expect(response.parsed_body.sole).to include(failed_at: be_present, last_error: 'rate limited')
  end

  it 'publishes a scheduled public post as followers-only' do
    post '/api/v1/statuses', headers: headers, params: { status: '예약', visibility: 'public', scheduled_at: 2.hours.from_now.iso8601 }
    scheduled = ScheduledStatus.find(response.parsed_body[:id])

    travel_to(scheduled.scheduled_at + 1.minute) { PublishScheduledStatusWorker.new.perform(scheduled.id) }

    expect(Status.where(account: user.account).sole.visibility).to eq 'private'
    expect(ScheduledStatus.exists?(scheduled.id)).to be false
  end
end
