# frozen_string_literal: true

require 'rails_helper'

# @_longwhile — 예약 게시물(/scheduled_statuses). 수정(PUT)·사용량(usage)은
#   spec/requests/api/v1/scheduled_status_spec.rb 와 update_scheduled_status_service_spec.rb
#   가 본다. 여기서는 그 둘이 다루지 않는 계약을 본다.
#
#     만들기   웹 작성창은 POST /api/v1/statuses 에 scheduled_at 을 실어 보낸다
#     실패 표시 목록의 failed_at · last_error 로 "게시 실패" 줄을 그린다 (포크가 더한 필드)
#     게시     예약된 글도 공개 범위 모델(팔로워 전용)을 따른다
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
