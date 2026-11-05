# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Frozen web frontend write contract' do
  let(:web_app) { Doorkeeper::Application.create!(name: 'Web', redirect_uri: 'urn:ietf:wg:oauth:2.0:oob', scopes: 'read write follow push', superapp: true) }
  let(:user)    { Fabricate(:user) }
  let(:me)      { user.account }
  let(:other)   { Fabricate(:user).account }
  let(:token)   { Fabricate(:accessible_access_token, application: web_app, resource_owner_id: user.id, scopes: 'read write follow push') }
  let(:headers) { { 'Authorization' => "Bearer #{token.token}" } }

  def expect_ok
    expect(response).to have_http_status(200)
  end

  describe 'account actions (actions/accounts.js, api/accounts.ts)' do
    it 'mutes with a duration and reads the relationship back' do
      post "/api/v1/accounts/#{other.id}/mute", headers: headers, params: { notifications: true, duration: 0 }, as: :json

      expect_ok
      expect(response.parsed_body).to include(id: other.id.to_s, muting: true, muting_notifications: true)
    end

    it 'unmutes, blocks and unblocks' do
      me.mute!(other)

      post "/api/v1/accounts/#{other.id}/unmute", headers: headers
      expect_ok
      expect(response.parsed_body).to include(muting: false)

      post "/api/v1/accounts/#{other.id}/block", headers: headers
      expect_ok
      expect(response.parsed_body).to include(blocking: true)

      post "/api/v1/accounts/#{other.id}/unblock", headers: headers
      expect_ok
      expect(response.parsed_body).to include(blocking: false)
    end

    it 'writes a private note' do
      post "/api/v1/accounts/#{other.id}/note", headers: headers, params: { comment: '메모' }, as: :json

      expect_ok
      expect(response.parsed_body).to include(note: '메모')
    end

    it 'features (pins) and unfeatures an account on the profile' do
      me.follow!(other)

      post "/api/v1/accounts/#{other.id}/pin", headers: headers
      expect_ok
      expect(response.parsed_body).to include(endorsed: true)

      post "/api/v1/accounts/#{other.id}/unpin", headers: headers
      expect_ok
      expect(response.parsed_body).to include(endorsed: false)
    end

    it 'removes a follower and unfollows' do
      other.follow!(me)
      me.follow!(other)

      post "/api/v1/accounts/#{other.id}/remove_from_followers", headers: headers
      expect_ok
      expect(response.parsed_body).to include(followed_by: false)

      post "/api/v1/accounts/#{other.id}/unfollow", headers: headers
      expect_ok
      expect(response.parsed_body).to include(following: false)
    end

    it 'authorizes and rejects follow requests' do
      me.update!(locked: true)
      requester = Fabricate(:account)
      FollowRequest.create!(account: other, target_account: me)
      FollowRequest.create!(account: requester, target_account: me)

      post "/api/v1/follow_requests/#{other.id}/authorize", headers: headers
      expect_ok
      expect(response.parsed_body).to include(followed_by: true)

      post "/api/v1/follow_requests/#{requester.id}/reject", headers: headers
      expect_ok
      expect(response.parsed_body).to include(followed_by: false)
    end

    it 'updates the profile with the multipart body of the onboarding form' do
      patch '/api/v1/accounts/update_credentials', headers: headers,
                                                   params: { display_name: '새 이름', note: '소개', discoverable: 'true', indexable: 'false' }

      expect_ok
      expect(response.parsed_body).to include(display_name: '새 이름', discoverable: true, indexable: false)
    end
  end

  describe 'status actions (actions/statuses.js, actions/interactions.js)' do
    let(:status) { PostStatusService.new.call(me, text: '내 글') }

    it 'pins and unpins a followers-only status' do
      post "/api/v1/statuses/#{status.id}/pin", headers: headers
      expect_ok
      expect(response.parsed_body).to include(visibility: 'private', pinned: true)

      post "/api/v1/statuses/#{status.id}/unpin", headers: headers
      expect_ok
      expect(response.parsed_body).to include(pinned: false)
    end

    it 'mutes and unmutes the conversation' do
      post "/api/v1/statuses/#{status.id}/mute", headers: headers
      expect_ok
      expect(response.parsed_body).to include(muted: true)

      post "/api/v1/statuses/#{status.id}/unmute", headers: headers
      expect_ok
      expect(response.parsed_body).to include(muted: false)
    end

    it 'undoes favourite, bookmark and reblog' do
      FavouriteService.new.call(me, status)
      Bookmark.create!(account: me, status: status)
      ReblogService.new.call(me, status)

      post "/api/v1/statuses/#{status.id}/unfavourite", headers: headers
      expect_ok
      expect(response.parsed_body).to include(favourited: false)

      post "/api/v1/statuses/#{status.id}/unbookmark", headers: headers
      expect_ok
      expect(response.parsed_body).to include(bookmarked: false)

      post "/api/v1/statuses/#{status.id}/unreblog", headers: headers
      expect_ok
      expect(response.parsed_body).to include(reblogged: false)
    end

    it 'edits with the compose payload, media_attributes and a null poll included' do
      put "/api/v1/statuses/#{status.id}", headers: headers, as: :json, params: {
        status: '고친 글', in_reply_to_id: nil, media_ids: [], media_attributes: [], sensitive: false,
        spoiler_text: '', visibility: 'private', poll: nil, language: 'ko'
      }

      expect_ok
      expect(response.parsed_body).to include(visibility: 'private')
      expect(response.parsed_body[:edited_at]).to be_present
      expect(status.reload.text).to eq '고친 글'
    end

    it 'deletes and returns the source text for "delete and redraft"' do
      delete "/api/v1/statuses/#{status.id}", headers: headers

      expect_ok
      expect(response.parsed_body).to include(text: '내 글')
    end

    it 'votes in a poll' do
      poll_status = PostStatusService.new.call(other, text: '투표', poll: { options: %w(가 나), expires_in: 3600 })
      me.follow!(other)

      post "/api/v1/polls/#{poll_status.poll.id}/votes", headers: headers, params: { choices: ['0'] }, as: :json

      expect_ok
      expect(response.parsed_body).to include(voted: true, own_votes: [0])
    end
  end

  describe 'compose media (actions/compose.js)' do
    it 'uploads, then describes an unattached attachment' do
      post '/api/v2/media', headers: headers, params: { file: fixture_file_upload('attachment.jpg', 'image/jpeg') }

      expect(response).to have_http_status(200).or have_http_status(202)
      media_id = response.parsed_body[:id]
      expect(response.parsed_body).to include(type: 'image')

      put "/api/v1/media/#{media_id}", headers: headers, params: { description: '설명', focus: '0.00,0.00' }, as: :json

      expect_ok
      expect(response.parsed_body).to include(id: media_id, description: '설명')
    end
  end

  describe 'scheduled statuses (actions/compose.js, actions/scheduled_statuses.js)' do
    it 'updates with the compose payload and deletes' do
      post '/api/v1/statuses', headers: headers, as: :json, params: { status: '예약', visibility: 'private', scheduled_at: 1.day.from_now.iso8601 }
      expect_ok
      scheduled_id = response.parsed_body[:id]

      put "/api/v1/scheduled_statuses/#{scheduled_id}", headers: headers, as: :json, params: {
        status: '고친 예약', in_reply_to_id: nil, media_ids: [], sensitive: false, spoiler_text: '',
        visibility: 'private', poll: nil, language: 'ko', scheduled_at: 2.days.from_now.iso8601
      }
      expect_ok
      expect(response.parsed_body.dig(:params, :text)).to eq '고친 예약'

      delete "/api/v1/scheduled_statuses/#{scheduled_id}", headers: headers
      expect_ok
    end
  end

  describe 'lists (api/lists.ts)' do
    it 'creates, updates, fills, empties and deletes a list' do
      me.follow!(other)

      post '/api/v1/lists', headers: headers, as: :json, params: { title: '목록', exclusive: false, replies_policy: 'list' }
      expect_ok
      list_id = response.parsed_body[:id]
      expect(response.parsed_body).to include(title: '목록', exclusive: false, replies_policy: 'list')

      put "/api/v1/lists/#{list_id}", headers: headers, as: :json, params: { id: list_id, title: '새 목록', exclusive: true, replies_policy: 'followed' }
      expect_ok
      expect(response.parsed_body).to include(title: '새 목록', exclusive: true)

      post "/api/v1/lists/#{list_id}/accounts", headers: headers, as: :json, params: { account_ids: [other.id.to_s] }
      expect_ok

      delete "/api/v1/lists/#{list_id}/accounts", headers: headers, as: :json, params: { account_ids: [other.id.to_s] }
      expect_ok

      delete "/api/v1/lists/#{list_id}", headers: headers
      expect_ok
    end
  end

  describe 'filters (actions/filters.js, features/ui/components/filter_modal.jsx)' do
    it 'creates a filter from a status and attaches the status' do
      status = PostStatusService.new.call(other, text: '거를 글')
      me.follow!(other)

      post '/api/v2/filters', headers: headers, as: :json, params: {
        title: '필터', context: %w(home notifications public thread account), action: 'warn'
      }
      expect_ok
      filter_id = response.parsed_body[:id]
      expect(response.parsed_body).to include(title: '필터', filter_action: 'warn')

      post "/api/v2/filters/#{filter_id}/statuses", headers: headers, as: :json, params: { filter_id: filter_id, status_id: status.id.to_s }
      expect_ok
      expect(response.parsed_body).to include(status_id: status.id.to_s)
    end
  end

  describe 'tags (api/tags.ts)' do
    it 'follows, unfollows, features and unfeatures a hashtag' do
      %w(follow unfollow feature unfeature).each do |action|
        post "/api/v1/tags/#{ERB::Util.url_encode('테스트')}/#{action}", headers: headers
        expect_ok
        expect(response.parsed_body).to include(name: '테스트')
      end
    end
  end

  describe 'reports (features/ui/components/report_modal.jsx)' do
    it 'files a report with the modal payload' do
      status = PostStatusService.new.call(other, text: '신고할 글')
      me.follow!(other)

      post '/api/v1/reports', headers: headers, as: :json, params: {
        account_id: other.id.to_s, status_ids: [status.id.to_s], forward_to_domains: [],
        comment: '', forward: false, category: 'other', rule_ids: []
      }

      expect_ok
      expect(response.parsed_body).to include(category: 'other', status_ids: [status.id.to_s])
    end
  end

  describe 'notifications (api/notification_policies.ts, actions/notifications.js)' do
    it 'saves the notification policy with the settings form body' do
      put '/api/v2/notifications/policy', headers: headers, as: :json, params: {
        for_not_following: 'filter', for_not_followers: 'accept', for_new_accounts: 'drop',
        for_private_mentions: 'filter', for_limited_accounts: 'filter'
      }

      expect_ok
      expect(response.parsed_body).to include(for_not_following: 'filter', for_new_accounts: 'drop')
      expect(response.parsed_body[:summary]).to include(:pending_requests_count, :pending_notifications_count)
    end

    it 'clears notifications' do
      post '/api/v1/notifications/clear', headers: headers

      expect_ok
    end
  end

  describe 'announcements (actions/announcements.js)' do
    it 'dismisses and reacts' do
      announcement = Fabricate(:announcement, published: true)

      put "/api/v1/announcements/#{announcement.id}/reactions/#{CGI.escape('👍')}", headers: headers
      expect_ok

      delete "/api/v1/announcements/#{announcement.id}/reactions/#{CGI.escape('👍')}", headers: headers
      expect_ok

      post "/api/v1/announcements/#{announcement.id}/dismiss", headers: headers
      expect_ok
    end
  end

  describe 'markers (actions/markers.ts)' do
    it 'saves the notifications read marker' do
      post '/api/v1/markers', headers: headers, as: :json, params: { notifications: { last_read_id: '1' } }

      expect_ok
      expect(response.parsed_body.dig(:notifications, :last_read_id)).to eq '1'
    end
  end

  describe 'admin dashboard widgets (components/admin/*, api(false) = session only)' do
    let(:user) { Fabricate(:owner_user) }

    before { sign_in user }

    it 'loads measures, dimensions and retention with the session cookie' do
      range = { start_at: 30.days.ago.to_date.to_s, end_at: Time.now.utc.to_date.to_s }

      post '/api/v1/admin/measures', params: range.merge(keys: %w(new_users)), as: :json
      expect_ok
      expect(response.parsed_body.first).to include(key: 'new_users')

      post '/api/v1/admin/dimensions', params: range.merge(keys: %w(sources), limit: 8), as: :json
      expect_ok
      expect(response.parsed_body.first).to include(key: 'sources')

      post '/api/v1/admin/retention', params: range.merge(frequency: 'day'), as: :json
      expect_ok
    end

    it 'changes a report category from the report page' do
      report = Fabricate(:report)

      put "/api/v1/admin/reports/#{report.id}", params: { category: 'spam', rule_ids: [] }, as: :json

      expect_ok
      expect(report.reload.category).to eq 'spam'
    end
  end
end
