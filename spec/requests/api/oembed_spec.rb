# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'API OEmbed' do
  describe 'GET /api/oembed' do
    let(:user) { Fabricate(:user) }
    let(:token) { Fabricate(:accessible_access_token, resource_owner_id: user.id, scopes: 'read') }
    let(:headers) { { 'Authorization' => "Bearer #{token.token}" } }

    before { host! Rails.configuration.x.local_domain }

    def get_oembed(status, headers: self.headers)
      get '/api/oembed', headers: headers, params: { url: short_account_status_url(status.account, status) }
    end

    # @_longwhile — 비로그인 접속을 막는 인스턴스라 oEmbed 도 로그인을 요구한다.
    # 웹 화면의 퍼 가기 창은 /api/web/embeds/:id 를 쓰므로 영향이 없다.
    context 'when not logged in' do
      let(:status) { Fabricate(:status, visibility: :public) }

      it 'returns http unauthorized without the post' do
        get_oembed(status, headers: {})

        expect(response)
          .to have_http_status(401)
        expect(response.content_type)
          .to start_with('application/json')
        expect(response.body)
          .to_not include(status.text)
      end
    end

    context 'when status is public' do
      let(:status) { Fabricate(:status, visibility: :public) }

      it 'returns success with private cache control headers' do
        get_oembed(status)

        expect(response)
          .to have_http_status(200)
        expect(response.content_type)
          .to start_with('application/json')
        expect(response.headers['Cache-Control'])
          .to include('private, no-store')
      end

      it 'also accepts the web session' do
        sign_in user

        get_oembed(status, headers: {})

        expect(response)
          .to have_http_status(200)
      end
    end

    context 'when status is not public' do
      let(:status) { Fabricate(:status, visibility: :direct) }

      it 'returns not found' do
        get_oembed(status)

        expect(response)
          .to have_http_status(404)
        expect(response.content_type)
          .to start_with('application/json')
      end
    end

    # 미등재는 이 인스턴스에서 팔로워 공개다(StatusPolicy#show?).
    context 'when status is unlisted' do
      let(:status) { Fabricate(:status, visibility: :unlisted) }

      it 'returns not found to someone who does not follow the author' do
        get_oembed(status)

        expect(response)
          .to have_http_status(404)
        expect(response.body)
          .to_not include(status.text)
      end

      it 'returns success to a follower' do
        user.account.follow!(status.account)

        get_oembed(status)

        expect(response)
          .to have_http_status(200)
      end
    end

    context 'when status is an announcement' do
      let(:announcer) { Fabricate.build(:account, username: PublicFeed::ANNOUNCEMENT_USERNAME).tap { |account| account.save!(validate: false) } }
      let(:status) { Fabricate(:status, account: announcer, visibility: :unlisted) }

      it 'returns success to any logged-in user' do
        get_oembed(status)

        expect(response)
          .to have_http_status(200)
      end
    end

    context 'when the author blocks the viewer' do
      let(:status) { Fabricate(:status, visibility: :public) }

      before { status.account.block!(user.account) }

      it 'returns not found' do
        get_oembed(status)

        expect(response)
          .to have_http_status(404)
      end
    end
  end
end
