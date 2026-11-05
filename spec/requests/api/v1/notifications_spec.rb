# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Notifications' do
  include_context 'with API authentication', oauth_scopes: 'read:notifications write:notifications'

  let(:user)    { Fabricate(:user, account_attributes: { username: 'alice' }) }

  # 이 포크는 모든 글을 팔로워 전용으로 올린다(943745d134). 남의 글을 부스트하거나
  # 관심글로 찍으려면 그 글을 볼 수 있어야 하므로 먼저 팔로우한 계정을 쓴다.
  # follow! 는 알림을 만들지 않아 알림 개수에 끼지 않는다.
  def follower_of(account)
    Fabricate(:account).tap { |follower| follower.follow!(account) }
  end

  describe 'GET /api/v1/notifications/unread_count', :inline_jobs do
    subject do
      get '/api/v1/notifications/unread_count', headers: headers, params: params
    end

    let(:params) { {} }

    before do
      first_status = PostStatusService.new.call(user.account, text: 'Test')
      ReblogService.new.call(follower_of(user.account), first_status)
      PostStatusService.new.call(Fabricate(:account), text: 'Hello @alice')
      FavouriteService.new.call(follower_of(user.account), first_status)
      FavouriteService.new.call(follower_of(user.account), first_status)
      FollowService.new.call(Fabricate(:account), user.account)
    end

    it_behaves_like 'forbidden for wrong scope', 'write write:notifications'

    context 'with no options' do
      it 'returns expected notifications count' do
        subject

        expect(response).to have_http_status(200)
        expect(response.content_type)
          .to start_with('application/json')
        expect(response.parsed_body[:count]).to eq 5
      end
    end

    context 'with a read marker' do
      before do
        id = user.account.notifications.browserable.order(id: :desc).offset(2).first.id
        user.markers.create!(timeline: 'notifications', last_read_id: id)
      end

      it 'returns expected notifications count' do
        subject

        expect(response).to have_http_status(200)
        expect(response.content_type)
          .to start_with('application/json')
        expect(response.parsed_body[:count]).to eq 2
      end
    end

    context 'with exclude_types param' do
      let(:params) { { exclude_types: %w(mention) } }

      it 'returns expected notifications count' do
        subject

        expect(response).to have_http_status(200)
        expect(response.content_type)
          .to start_with('application/json')
        expect(response.parsed_body[:count]).to eq 4
      end
    end

    context 'with a user-provided limit' do
      let(:params) { { limit: 2 } }

      it 'returns a capped value' do
        subject

        expect(response).to have_http_status(200)
        expect(response.content_type)
          .to start_with('application/json')
        expect(response.parsed_body[:count]).to eq 2
      end
    end

    context 'when there are more notifications than the limit' do
      before do
        stub_const('Api::V1::NotificationsController::DEFAULT_NOTIFICATIONS_COUNT_LIMIT', 2)
      end

      it 'returns a capped value' do
        subject

        expect(response).to have_http_status(200)
        expect(response.content_type)
          .to start_with('application/json')
        expect(response.parsed_body[:count]).to eq Api::V1::NotificationsController::DEFAULT_NOTIFICATIONS_COUNT_LIMIT
      end
    end
  end

  describe 'GET /api/v1/notifications', :inline_jobs do
    subject do
      get '/api/v1/notifications', headers: headers, params: params
    end

    let(:bob)    { Fabricate(:user) }
    let(:tom)    { Fabricate(:user) }
    let(:params) { {} }

    before do
      # 글이 전부 팔로워 전용이라 부스트·관심글 전에 팔로우가 먼저다. 그래서 bob 의 팔로우를
      # 맨 앞으로 옮기고, tom 은 알림 없이(follow!) 팔로우시킨다.
      FollowService.new.call(bob.account, user.account)
      tom.account.follow!(user.account)
      first_status = PostStatusService.new.call(user.account, text: 'Test')
      ReblogService.new.call(bob.account, first_status)
      PostStatusService.new.call(bob.account, text: 'Hello @alice')
      PostStatusService.new.call(tom.account, text: 'Hello @alice', visibility: :direct) # Filtered by default
      FavouriteService.new.call(bob.account, first_status)
      FavouriteService.new.call(tom.account, first_status)
    end

    it_behaves_like 'forbidden for wrong scope', 'write write:notifications'

    context 'with no options' do
      it 'returns expected notification types', :aggregate_failures do
        subject

        expect(response).to have_http_status(200)
        expect(response.content_type)
          .to start_with('application/json')
        expect(response.parsed_body.size).to eq 5
        expect(body_json_types).to include('reblog', 'mention', 'favourite', 'follow')
        expect(response.parsed_body.any? { |x| x[:filtered] }).to be false
      end
    end

    context 'with include_filtered' do
      let(:params) { { include_filtered: true } }

      it 'returns expected notification types, including filtered notifications' do
        subject

        expect(response).to have_http_status(200)
        expect(response.content_type)
          .to start_with('application/json')
        expect(response.parsed_body.size).to eq 6
        expect(body_json_types).to include('reblog', 'mention', 'favourite', 'follow')
        expect(response.parsed_body.any? { |x| x[:filtered] }).to be true
      end
    end

    # @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
    #   DM 은 **기본으로 보인다.** 빼는 쪽이 `exclude_direct_messages` 를 보낸다 —
    #   그 하나를 보내는 것은 우리 웹 UI 뿐이고, 파라미터를 모르는 공식 모바일 앱은
    #   그대로 받는다. 판정은 계정이 아니라 **요청**에 건다 — 자동봇을 돌리는 계정이
    #   사람도 함께 쓰는 계정인 경우가 흔해 "봇 계정" 플래그로는 가를 수 없다.
    #   (DECISIONS.md A-62 — A-60 의 방향을 뒤집었다)
    context 'when DM chat is enabled' do
      before { allow(Mastodon::DmChat).to receive(:enabled?).and_return(true) }

      context 'with include_filtered' do
        let(:params) { { include_filtered: true } }

        it 'returns direct messages to callers that do not ask to exclude them' do
          subject

          expect(response).to have_http_status(200)
          expect(response.parsed_body.size).to eq 6
        end
      end

      context 'with exclude_direct_messages' do
        let(:params) { { include_filtered: true, exclude_direct_messages: true } }

        it 'leaves direct messages out' do
          subject

          expect(response).to have_http_status(200)
          expect(response.parsed_body.size).to eq 5
        end
      end
    end

    context 'with account_id param' do
      let(:params) { { account_id: tom.account.id } }

      it 'returns only notifications from specified user', :aggregate_failures do
        subject

        expect(response).to have_http_status(200)
        expect(response.content_type)
          .to start_with('application/json')
        expect(body_json_account_ids.uniq).to eq [tom.account.id.to_s]
      end

      def body_json_account_ids
        response.parsed_body.map { |x| x[:account][:id] }
      end
    end

    context 'with invalid account_id param' do
      let(:params) { { account_id: 'foo' } }

      it 'returns nothing', :aggregate_failures do
        subject

        expect(response).to have_http_status(200)
        expect(response.content_type)
          .to start_with('application/json')
        expect(response.parsed_body.size).to eq 0
      end
    end

    context 'with exclude_types param' do
      let(:params) { { exclude_types: %w(mention) } }

      it 'returns everything but excluded type', :aggregate_failures do
        subject

        expect(response).to have_http_status(200)
        expect(response.content_type)
          .to start_with('application/json')
        expect(response.parsed_body.size).to_not eq 0
        expect(body_json_types.uniq).to_not include 'mention'
      end
    end

    context 'with types param' do
      let(:params) { { types: %w(mention) } }

      it 'returns only requested type', :aggregate_failures do
        subject

        expect(response).to have_http_status(200)
        expect(response.content_type)
          .to start_with('application/json')
        expect(body_json_types.uniq).to eq ['mention']
      end
    end

    context 'with limit param' do
      let(:params) { { limit: 3 } }

      it 'returns the requested number of notifications paginated', :aggregate_failures do
        subject

        notifications = user.account.notifications.browserable.order(id: :asc)

        expect(response.parsed_body.size)
          .to eq(params[:limit])

        expect(response)
          .to include_pagination_headers(
            prev: api_v1_notifications_url(limit: params[:limit], min_id: notifications.last.id),
            next: api_v1_notifications_url(limit: params[:limit], max_id: notifications[2].id)
          )
      end
    end

    def body_json_types
      response.parsed_body.pluck(:type)
    end
  end

  describe 'GET /api/v1/notifications/:id' do
    subject do
      get "/api/v1/notifications/#{notification.id}", headers: headers
    end

    let(:notification) { Fabricate(:notification, account: user.account) }

    it_behaves_like 'forbidden for wrong scope', 'write write:notifications'

    it 'returns http success' do
      subject

      expect(response).to have_http_status(200)
      expect(response.content_type)
        .to start_with('application/json')
    end

    context 'when notification belongs to someone else' do
      let(:notification) { Fabricate(:notification) }

      it 'returns http not found' do
        subject

        expect(response).to have_http_status(404)
        expect(response.content_type)
          .to start_with('application/json')
      end
    end
  end

  describe 'POST /api/v1/notifications/:id/dismiss' do
    subject do
      post "/api/v1/notifications/#{notification.id}/dismiss", headers: headers
    end

    let!(:notification) { Fabricate(:notification, account: user.account) }

    it_behaves_like 'forbidden for wrong scope', 'read read:notifications'

    it 'destroys the notification' do
      subject

      expect(response).to have_http_status(200)
      expect(response.content_type)
        .to start_with('application/json')
      expect { notification.reload }.to raise_error(ActiveRecord::RecordNotFound)
    end

    context 'when notification belongs to someone else' do
      let(:notification) { Fabricate(:notification) }

      it 'returns http not found' do
        subject

        expect(response).to have_http_status(404)
        expect(response.content_type)
          .to start_with('application/json')
      end
    end
  end

  describe 'POST /api/v1/notifications/clear' do
    subject do
      post '/api/v1/notifications/clear', headers: headers
    end

    before do
      Fabricate(:notification, account: user.account)
    end

    it_behaves_like 'forbidden for wrong scope', 'read read:notifications'

    it 'clears notifications for the account' do
      subject

      expect(user.account.reload.notifications).to be_empty
      expect(response).to have_http_status(200)
      expect(response.content_type)
        .to start_with('application/json')
    end
  end
end
