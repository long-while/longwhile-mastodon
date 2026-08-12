# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Scheduled Statuses' do
  let(:user)    { Fabricate(:user) }
  let(:token)   { Fabricate(:accessible_access_token, resource_owner_id: user.id, scopes: scopes) }
  let(:headers) { { 'Authorization' => "Bearer #{token.token}" } }

  describe 'GET /api/v1/scheduled_statuses' do
    context 'when not authorized' do
      it 'returns http unauthorized' do
        get api_v1_scheduled_statuses_path

        expect(response)
          .to have_http_status(401)
        expect(response.content_type)
          .to start_with('application/json')
      end
    end

    context 'with wrong scope' do
      before do
        get api_v1_scheduled_statuses_path, headers: headers
      end

      it_behaves_like 'forbidden for wrong scope', 'write write:statuses'
    end

    context 'with an application token' do
      let(:token) { Fabricate(:accessible_access_token, resource_owner_id: nil, scopes: 'read:statuses') }

      it 'returns http unprocessable entity' do
        get api_v1_scheduled_statuses_path, headers: headers

        expect(response)
          .to have_http_status(422)
        expect(response.content_type)
          .to start_with('application/json')
      end
    end

    context 'with correct scope' do
      let(:scopes) { 'read:statuses' }

      context 'without scheduled statuses' do
        it 'returns http success without json' do
          get api_v1_scheduled_statuses_path, headers: headers

          expect(response)
            .to have_http_status(200)
          expect(response.content_type)
            .to start_with('application/json')

          expect(response.parsed_body)
            .to_not be_present
        end
      end

      context 'with scheduled statuses' do
        let!(:scheduled_status) { Fabricate(:scheduled_status, account: user.account) }

        it 'returns http success and status json' do
          get api_v1_scheduled_statuses_path, headers: headers

          expect(response)
            .to have_http_status(200)
          expect(response.content_type)
            .to start_with('application/json')

          expect(response.parsed_body)
            .to be_present
            .and have_attributes(
              first: include(id: scheduled_status.id.to_s)
            )
        end
      end
    end
  end

  describe 'GET /api/v1/scheduled_statuses/usage' do
    let(:scopes) { 'read:statuses' }

    before { Fabricate(:scheduled_status, account: user.account) }

    it 'reports how much of the allowance is used' do
      get usage_api_v1_scheduled_statuses_path, headers: headers

      expect(response).to have_http_status(200)
      expect(response.parsed_body).to include(
        total: 1,
        total_limit: ScheduledStatus::TOTAL_LIMIT,
        daily_limit: ScheduledStatus::DAILY_LIMIT,
        minimum_offset: ScheduledStatus::MINIMUM_OFFSET.to_i,
        failed: 0
      )
    end
  end

  describe 'PUT /api/v1/scheduled_statuses/:id' do
    let(:scopes) { 'write:statuses' }
    let!(:scheduled_status) { Fabricate(:scheduled_status, account: user.account, params: { text: 'before', visibility: 'private' }) }

    it 'moves the publication time' do
      new_time = 30.hours.from_now

      put api_v1_scheduled_status_path(scheduled_status), headers: headers, params: { scheduled_at: new_time.iso8601 }

      expect(response).to have_http_status(200)
      expect(scheduled_status.reload.scheduled_at).to be_within(1.second).of(new_time)
    end

    it 'rewrites the body without changing the record id' do
      put api_v1_scheduled_status_path(scheduled_status), headers: headers, params: { status: 'after', spoiler_text: 'heads up' }

      expect(response).to have_http_status(200)
      expect(response.parsed_body[:id]).to eq scheduled_status.id.to_s

      scheduled_status.reload
      expect(scheduled_status.params['text']).to eq 'after'
      expect(scheduled_status.params['spoiler_text']).to eq 'heads up'
      # Untouched keys survive.
      expect(scheduled_status.params['visibility']).to eq 'private'
    end

    it 'clears a recorded failure so the post is retried' do
      scheduled_status.record_failure!('boom')

      put api_v1_scheduled_status_path(scheduled_status), headers: headers, params: { scheduled_at: 30.hours.from_now.iso8601 }

      expect(response).to have_http_status(200)

      scheduled_status.reload
      expect(scheduled_status.failed_at).to be_nil
      expect(scheduled_status.last_error).to be_nil
    end

    it 'rejects a time below the minimum offset' do
      put api_v1_scheduled_status_path(scheduled_status), headers: headers, params: { scheduled_at: 1.hour.ago.iso8601 }

      expect(response).to have_http_status(422)
    end

    # The web composer always sends the full body as JSON, including the keys it
    # has nothing for: `poll: null`, `in_reply_to_id: null`, `media_ids: []`.
    # Form-encoded params drop those, so the shape below is the only one that
    # exercises what the UI actually posts.
    context 'with the payload the web composer sends' do
      it 'accepts a null poll on a post that never had one', :aggregate_failures do
        put api_v1_scheduled_status_path(scheduled_status),
            headers: headers,
            params: {
              status: 'after',
              spoiler_text: '',
              sensitive: false,
              visibility: 'private',
              language: 'ko',
              in_reply_to_id: nil,
              media_ids: [],
              poll: nil,
              scheduled_at: 30.hours.from_now.iso8601,
            },
            as: :json

        expect(response).to have_http_status(200)
        expect(scheduled_status.reload.params['text']).to eq 'after'
        expect(scheduled_status.params['poll']).to be_nil
      end

      it 'still stores a poll when one is given' do
        put api_v1_scheduled_status_path(scheduled_status),
            headers: headers,
            params: {
              status: 'pick one',
              poll: { options: %w(a b), expires_in: 3600, multiple: false },
            },
            as: :json

        expect(response).to have_http_status(200)
        expect(scheduled_status.reload.params.dig('poll', 'options')).to eq %w(a b)
      end
    end
  end
end
