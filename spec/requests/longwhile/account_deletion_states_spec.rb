# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Account deletion states' do
  let(:viewer_user) { Fabricate(:user) }
  let(:viewer)      { viewer_user.account }
  let(:author_user) { Fabricate(:user, account_attributes: { username: 'leaver' }) }
  let(:author)      { author_user.account }
  let(:token)       { Fabricate(:accessible_access_token, resource_owner_id: viewer_user.id, scopes: 'read') }
  let(:headers)     { { 'Authorization' => "Bearer #{token.token}" } }

  def private_status(account, **attributes)
    Fabricate(:status, account: account, visibility: :private, **attributes)
  end

  def ids_from(path, params = {})
    get path, headers: headers, params: params
    expect(response).to have_http_status(200)
    response.parsed_body.pluck(:id)
  end

  def anonymize!(account)
    account.suspend!
    Admin::AccountDeletionWorker.new.perform(account.id, { 'preserve_content' => true })
    account.reload
  end

  describe 'an anonymised account (posts kept)' do
    let!(:status) { private_status(author, text: 'kept #squirrel').tap { |s| s.update!(tags: Tag.find_or_create_by_names('squirrel')) } }

    before do
      viewer.follow!(author)
      FeedManager.instance.push_to_home(viewer, status)
      anonymize!(author)
    end

    it 'is neither suspended nor deleted, only unavailable', :aggregate_failures do
      expect(author.anonymized?).to be true
      expect(author.suspended?).to be false
      expect(author.deleted?).to be false
      expect(author.requested_deletion_at).to be_nil
      expect(author.unavailable?).to be true
      expect(author.permanently_unavailable?).to be false
      expect(Account.without_suspended).to include(author)
      expect(Account.without_unavailable).to_not include(author)
    end

    it 'keeps its posts in the home timelines they were delivered to' do
      expect(ids_from('/api/v1/timelines/home')).to include(status.id.to_s)
    end

    context 'when the viewer still follows it' do
      before { Fabricate(:follow, account: viewer, target_account: author) }

      it 'keeps its posts in the public tab' do
        expect(ids_from('/api/v1/timelines/public', remote: false, only_media: false)).to include(status.id.to_s)
      end

      it 'keeps its posts in the hashtag timeline' do
        expect(ids_from('/api/v1/timelines/tag/squirrel')).to include(status.id.to_s)
      end

      it 'keeps the post readable through the API under the anonymous name', :aggregate_failures do
        get "/api/v1/statuses/#{status.id}", headers: headers

        expect(response).to have_http_status(200)
        expect(response.parsed_body[:account]).to include(
          username: Account::ANONYMIZED_USERNAME,
          acct: Account::ANONYMIZED_USERNAME,
          display_name: Account::ANONYMIZED_DISPLAY_NAME
        )
      end

      it 'keeps the post page instead of answering 410 Gone' do
        sign_in viewer_user
        get short_account_status_path(account_username: author.username, id: status.id)

        expect(response).to have_http_status(200)
      end
    end

    it 'keeps the profile reachable instead of 404 like a deleted account', :aggregate_failures do
      get "/api/v1/accounts/#{author.id}", headers: headers
      expect(response).to have_http_status(200)
      expect(response.parsed_body).to include(username: Account::ANONYMIZED_USERNAME)

      get '/api/v1/accounts/lookup', headers: headers, params: { acct: author.username }
      expect(response).to have_http_status(200)
    end

    it 'still hides notifications it sent (unchanged fork rule)' do
      mention = Fabricate(:mention, account: viewer, status: private_status(author, text: '@viewer hi'))
      Fabricate(:notification, account: viewer, activity: mention, from_account: author, type: :mention)

      get '/api/v2/notifications', headers: headers
      expect(response).to have_http_status(200)
      expect(response.parsed_body[:notification_groups]).to be_empty
    end
  end

  describe 'a self-deleted account (4.7 "deleted" state)' do
    let!(:status) { private_status(author, text: 'going #squirrel') }

    before do
      viewer.follow!(author)
      mention = Fabricate(:mention, account: viewer, status: private_status(author, text: '@viewer bye'))
      Fabricate(:notification, account: viewer, activity: mention, from_account: author, type: :mention)
      author.mark_deleted!
      author.reload
    end

    it 'is unavailable but not anonymised', :aggregate_failures do
      expect(author.deleted?).to be true
      expect(author.anonymized?).to be false
      expect(author.unavailable?).to be true
      expect(Account.without_suspended).to_not include(author)
      expect(Account.without_unavailable).to_not include(author)
    end

    it 'answers 404 from the account API' do
      get "/api/v1/accounts/#{author.id}", headers: headers

      expect(response).to have_http_status(404)
    end

    it 'drops out of the public tab' do
      expect(ids_from('/api/v1/timelines/public', remote: false, only_media: false)).to_not include(status.id.to_s)
    end

    it 'drops out of notifications' do
      get '/api/v2/notifications', headers: headers

      expect(response).to have_http_status(200)
      expect(response.parsed_body[:notification_groups]).to be_empty
    end

    it 'turns the post page away' do
      sign_in viewer_user
      get short_account_status_path(account_username: author.username, id: status.id)

      expect(response).to have_http_status(403)
    end

    it 'is removed for good by the deletion worker without being anonymised', :aggregate_failures, :inline_jobs do
      AccountDeletionWorker.new.perform(author.id)
      author.reload

      expect(author.anonymized?).to be false
      expect(author.deleted?).to be true
      expect(author.suspended?).to be false
      expect(Status.find_by(id: status.id)).to be_nil
    end
  end
end
