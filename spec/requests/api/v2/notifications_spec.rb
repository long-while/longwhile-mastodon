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

  describe 'GET /api/v2/notifications/unread_count', :inline_jobs do
    subject do
      get '/api/v2/notifications/unread_count', headers: headers, params: params
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
        expect(response.parsed_body[:count]).to eq 4
      end
    end

    context 'with grouped_types parameter' do
      let(:params) { { grouped_types: %w(reblog) } }

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
        expect(response.parsed_body[:count]).to eq 3
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
        stub_const('Api::V2::NotificationsController::DEFAULT_NOTIFICATIONS_COUNT_LIMIT', 2)
      end

      it 'returns a capped value' do
        subject

        expect(response).to have_http_status(200)
        expect(response.content_type)
          .to start_with('application/json')
        expect(response.parsed_body[:count]).to eq Api::V2::NotificationsController::DEFAULT_NOTIFICATIONS_COUNT_LIMIT
      end
    end
  end

  describe 'GET /api/v2/notifications', :inline_jobs do
    subject do
      get '/api/v2/notifications', headers: headers, params: params
    end

    let(:bob)    { Fabricate(:user) }
    let(:tom)    { Fabricate(:user) }
    let(:params) { {} }

    before do
      # 글이 전부 팔로워 전용이라 부스트·관심글 전에 팔로우가 먼저다. 그래서 bob 의 팔로우를
      # 맨 앞으로 옮기고, tom 은 알림 없이(follow!) 팔로우시킨다. 알림 순서가 바뀐 만큼
      # 아래 since_id 예제의 기준 위치도 옮겼다.
      FollowService.new.call(bob.account, user.account)
      tom.account.follow!(user.account)
      first_status = PostStatusService.new.call(user.account, text: 'Test')
      ReblogService.new.call(bob.account, first_status)
      PostStatusService.new.call(bob.account, text: 'Hello @alice')
      FavouriteService.new.call(bob.account, first_status)
      FavouriteService.new.call(tom.account, first_status)
    end

    it_behaves_like 'forbidden for wrong scope', 'write write:notifications'

    context 'when there are no notifications' do
      before do
        user.account.notifications.destroy_all
      end

      it 'returns 0 notifications' do
        subject

        expect(response).to have_http_status(200)
        expect(response.content_type)
          .to start_with('application/json')
        expect(response.parsed_body[:notification_groups]).to eq []
      end
    end

    context 'when there are numerous notifications for the same final group' do
      before do
        user.account.notifications.destroy_all
        5.times.each { FavouriteService.new.call(follower_of(user.account), user.account.statuses.first) }
      end

      context 'with no options' do
        it 'returns a notification group covering all notifications' do
          subject

          notification_ids = user.account.notifications.order(id: :asc).pluck(:id)

          expect(response).to have_http_status(200)
          expect(response.content_type)
            .to start_with('application/json')
          expect(response.parsed_body[:notification_groups].size)
            .to eq(1)
          expect(response.parsed_body.dig(:notification_groups, 0))
            .to include(type: 'favourite')
            .and(include(sample_account_ids: have_attributes(size: 5)))
            .and(include(page_max_id: notification_ids.last.to_s))
            .and(include(page_min_id: notification_ids.first.to_s))
        end
      end

      context 'with min_id param' do
        let(:params) { { min_id: user.account.notifications.order(id: :asc).first.id - 1 } }

        it 'returns a notification group covering all notifications' do
          subject

          notification_ids = user.account.notifications.order(id: :asc).pluck(:id)

          expect(response).to have_http_status(200)
          expect(response.content_type)
            .to start_with('application/json')
          expect(response.parsed_body[:notification_groups].size)
            .to eq(1)
          expect(response.parsed_body.dig(:notification_groups, 0))
            .to include(type: 'favourite')
            .and(include(sample_account_ids: have_attributes(size: 5)))
            .and(include(page_max_id: notification_ids.last.to_s))
            .and(include(page_min_id: notification_ids.first.to_s))
        end
      end
    end

    context 'with no options' do
      it 'returns expected notification types', :aggregate_failures do
        subject

        expect(response).to have_http_status(200)
        expect(response.content_type)
          .to start_with('application/json')
        expect(body_json_types).to include('reblog', 'mention', 'favourite', 'follow')
      end
    end

    context 'with grouped_types param' do
      let(:params) { { grouped_types: %w(reblog) } }

      it 'returns everything, but does not group favourites' do
        subject

        expect(response).to have_http_status(200)
        expect(response.content_type)
          .to start_with('application/json')
        expect(response.parsed_body[:notification_groups]).to contain_exactly(
          a_hash_including(
            type: 'reblog',
            sample_account_ids: [bob.account_id.to_s]
          ),
          a_hash_including(
            type: 'mention',
            sample_account_ids: [bob.account_id.to_s]
          ),
          a_hash_including(
            type: 'favourite',
            sample_account_ids: [bob.account_id.to_s]
          ),
          a_hash_including(
            type: 'favourite',
            sample_account_ids: [tom.account_id.to_s]
          ),
          a_hash_including(
            type: 'follow',
            sample_account_ids: [bob.account_id.to_s]
          )
        )
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
        expect(response.parsed_body.dig(:notification_groups, 0, :page_min_id)).to_not be_nil
      end
    end

    context 'with limit param' do
      let(:params) { { limit: 3 } }
      let(:notifications) { user.account.notifications.reorder(id: :desc) }

      it 'returns the requested number of notifications paginated', :aggregate_failures do
        subject

        expect(response.parsed_body[:notification_groups].size)
          .to eq(params[:limit])

        expect(response)
          .to include_pagination_headers(
            prev: api_v2_notifications_url(limit: params[:limit], min_id: notifications.first.id),
            # TODO: one downside of the current approach is that we return the first ID matching the group,
            # not the last that has been skipped, so pagination is very likely to give overlap
            next: api_v2_notifications_url(limit: params[:limit], max_id: notifications[3].id)
          )
        expect(response.content_type)
          .to start_with('application/json')
      end
    end

    context 'with since_id param' do
      let(:params) { { since_id: notifications[3].id } }
      let(:notifications) { user.account.notifications.reorder(id: :desc) }

      it 'returns the requested number of notifications paginated', :aggregate_failures do
        subject

        expect(response.parsed_body[:notification_groups].size)
          .to eq(2)

        expect(response.content_type)
          .to start_with('application/json')
        expect(response)
          .to include_pagination_headers(
            prev: api_v2_notifications_url(limit: params[:limit], min_id: notifications.first.id),
            # TODO: one downside of the current approach is that we return the first ID matching the group,
            # not the last that has been skipped, so pagination is very likely to give overlap
            next: api_v2_notifications_url(limit: params[:limit], max_id: notifications[2].id)
          )
      end
    end

    context 'when requesting stripped-down accounts' do
      let(:params) { { expand_accounts: 'partial_avatars' } }

      let(:recent_account) { follower_of(user.account) }

      before do
        FavouriteService.new.call(recent_account, user.account.statuses.first)
      end

      it 'returns an account in "partial_accounts", with the expected keys', :aggregate_failures do
        subject

        expect(response).to have_http_status(200)
        expect(response.content_type)
          .to start_with('application/json')
        expect(response.parsed_body[:partial_accounts].size).to be > 0
        expect(response.parsed_body[:partial_accounts][0].keys.map(&:to_sym)).to contain_exactly(:acct, :avatar, :avatar_static, :avatar_description, :bot, :id, :locked, :url)
        expect(response.parsed_body[:partial_accounts].pluck(:id)).to_not include(recent_account.id.to_s)
        expect(response.parsed_body[:accounts].pluck(:id)).to include(recent_account.id.to_s)
      end
    end

    context 'when passing an invalid value for "expand_accounts"' do
      let(:params) { { expand_accounts: 'unknown_foobar' } }

      it 'returns http bad request' do
        subject

        expect(response).to have_http_status(400)
        expect(response.content_type)
          .to start_with('application/json')
      end
    end

    def body_json_types
      response.parsed_body[:notification_groups].pluck(:type)
    end
  end

  describe 'GET /api/v2/notifications/:id' do
    subject do
      get "/api/v2/notifications/#{notification.group_key}", headers: headers
    end

    let(:notification) { Fabricate(:notification, account: user.account, group_key: 'foobar') }

    it_behaves_like 'forbidden for wrong scope', 'write write:notifications'

    it 'returns http success' do
      subject

      expect(response).to have_http_status(200)
      expect(response.content_type)
        .to start_with('application/json')
    end

    context 'with an ungrouped notification' do
      let(:notification) { Fabricate(:notification, account: user.account, type: :favourite) }

      it 'returns http success' do
        get "/api/v2/notifications/ungrouped-#{notification.id}", headers: headers

        expect(response).to have_http_status(200)
        expect(response.content_type)
          .to start_with('application/json')
      end
    end

    context 'when notification belongs to someone else' do
      let(:notification) { Fabricate(:notification, group_key: 'foobar') }

      it 'returns http not found' do
        subject

        expect(response).to have_http_status(404)
        expect(response.content_type)
          .to start_with('application/json')
      end
    end
  end

  describe 'POST /api/v2/notifications/:id/dismiss' do
    subject do
      post "/api/v2/notifications/#{notification.group_key}/dismiss", headers: headers
    end

    let!(:notification) { Fabricate(:notification, account: user.account, group_key: 'foobar') }

    it_behaves_like 'forbidden for wrong scope', 'read read:notifications'

    it 'destroys the notification' do
      subject

      expect(response).to have_http_status(200)
      expect(response.content_type)
        .to start_with('application/json')
      expect { notification.reload }.to raise_error(ActiveRecord::RecordNotFound)
    end

    context 'with an ungrouped notification' do
      let(:notification) { Fabricate(:notification, account: user.account, type: :favourite) }

      it 'destroys the notification' do
        post "/api/v2/notifications/ungrouped-#{notification.id}/dismiss", headers: headers

        expect(response).to have_http_status(200)
        expect(response.content_type)
          .to start_with('application/json')
        expect { notification.reload }.to raise_error(ActiveRecord::RecordNotFound)
      end
    end

    context 'when notification belongs to someone else' do
      let(:notification) { Fabricate(:notification, group_key: 'foobar') }

      it 'leaves the notification alone' do
        expect { subject }
          .to_not change(Notification, :count)

        expect(response).to have_http_status(200)
        expect(response.content_type)
          .to start_with('application/json')
      end
    end
  end

  describe 'POST /api/v2/notifications/clear' do
    subject do
      post '/api/v2/notifications/clear', headers: headers
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
  # @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
  #   **v2 가 웹이 실제로 쓰는 경로다.** 알림함도 종 배지 숫자도 여기서 나오므로,
  #   여기가 새면 사람 화면에 DM 이 올라온다. v1 에도 같은 짝이 있다.
  #
  #   DM 은 **기본으로 보인다.** 빼는 쪽이 `exclude_direct_messages` 를 보내고,
  #   그것을 보내는 것은 우리 웹 UI 뿐이다 — 파라미터를 모르는 공식 모바일 앱은
  #   그대로 받는다. (DECISIONS.md A-62)
  describe 'GET /api/v2/notifications with direct messages', :inline_jobs do
    subject do
      get '/api/v2/notifications', headers: headers, params: params
    end

    let(:bob)    { Fabricate(:user) }
    let(:params) { {} }

    before do
      allow(Mastodon::DmChat).to receive(:enabled?).and_return(true)
      # user 는 지연 let 이라, 먼저 만들지 않으면 '@alice' 가 없는 계정을 가리켜 멘션이 생기지 않는다.
      user
      PostStatusService.new.call(bob.account, text: 'Hello @alice')
      PostStatusService.new.call(bob.account, text: 'Hello @alice', visibility: :direct)
    end

    def body_json_types
      response.parsed_body[:notification_groups].map { |group| group[:type] }
    end

    context 'with no options' do
      it 'returns the direct message to callers that do not ask to exclude it' do
        subject

        expect(response).to have_http_status(200)
        expect(response.parsed_body[:notification_groups].size).to eq 2
        expect(body_json_types).to eq %w(mention mention)
      end
    end

    context 'with exclude_direct_messages' do
      let(:params) { { exclude_direct_messages: true } }

      it 'leaves the direct message out' do
        subject

        expect(response).to have_http_status(200)
        expect(response.parsed_body[:notification_groups].size).to eq 1
      end
    end

    # 다음 페이지 링크에 파라미터가 실려야 한다. 빠지면 웹의 알림함이 아래로
    # 내려갈수록 DM 이 나타난다 — 첫 페이지만 보고는 못 잡는 종류의 회귀다.
    context 'with exclude_direct_messages and pagination' do
      let(:params) { { exclude_direct_messages: true, limit: 1 } }

      it 'carries the parameter into the next page link' do
        subject

        expect(response).to have_http_status(200)
        expect(response.headers['Link']).to be_present
        expect(response.headers['Link']).to include('exclude_direct_messages')
      end
    end
  end
end
