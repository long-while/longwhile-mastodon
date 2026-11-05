# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'API Markers' do
  include_context 'with API authentication', oauth_scopes: 'read:statuses write:statuses'

  describe 'GET /api/v1/markers' do
    before do
      travel_to DateTime.parse('2026-03-15T12:34:56.789Z'), with_usec: true do
        Fabricate(:marker, timeline: 'home', last_read_id: 123, user: user)
        Fabricate(:marker, timeline: 'notifications', last_read_id: 456, user: user)
      end

      get '/api/v1/markers', headers: headers, params: { timeline: %w(home notifications) }
    end

    it 'returns markers', :aggregate_failures do
      expect(response).to have_http_status(200)
      expect(response.content_type)
        .to start_with('application/json')
      expect(response.parsed_body)
        .to include(
          home: include(last_read_id: '123'),
          notifications: include(last_read_id: '456')
        )
    end

    it 'uses a specific style of IS08601 timestamps' do
      expect(response.parsed_body)
        # 이 포크는 Time.zone 이 Asia/Seoul 이라 오프셋이 붙어 나간다(4.5 부터 같다). 형식(밀리초 세 자리)만 본다.
        .to include(home: include(updated_at: eq(Time.zone.parse('2026-03-15T12:34:56.789Z').iso8601(3))))
    end
  end

  describe 'POST /api/v1/markers' do
    context 'when no marker exists' do
      before do
        post '/api/v1/markers', headers: headers, params: { home: { last_read_id: '69420' } }
      end

      it 'creates a marker', :aggregate_failures do
        expect(response).to have_http_status(200)
        expect(response.content_type)
          .to start_with('application/json')
        expect(user.markers.first.timeline).to eq 'home'
        expect(user.markers.first.last_read_id).to eq 69_420
      end
    end

    context 'when a marker exists' do
      before do
        post '/api/v1/markers', headers: headers, params: { home: { last_read_id: '69420' } }
        post '/api/v1/markers', headers: headers, params: { home: { last_read_id: '70120' } }
      end

      it 'updates a marker', :aggregate_failures do
        expect(response).to have_http_status(200)
        expect(response.content_type)
          .to start_with('application/json')
        expect(user.markers.first.timeline).to eq 'home'
        expect(user.markers.first.last_read_id).to eq 70_120
      end
    end

    context 'when database object becomes stale' do
      before do
        allow(Marker).to receive(:transaction).and_raise(ActiveRecord::StaleObjectError)
        post '/api/v1/markers', headers: headers, params: { home: { last_read_id: '69420' } }
      end

      it 'returns error json' do
        expect(response)
          .to have_http_status(409)
        expect(response.content_type)
          .to start_with('application/json')
        expect(response.parsed_body)
          .to include(error: /Conflict during update/)
      end
    end
  end
end
