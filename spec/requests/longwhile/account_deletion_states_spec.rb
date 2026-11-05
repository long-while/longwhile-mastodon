# frozen_string_literal: true

require 'rails_helper'

# @_longwhile — 4.7 의 "자기 삭제" 상태(requested_deletion_at)와 포크의 "글 남기고 탈퇴"
#   (anonymized_at) 를 함께 본다.
#
#   4.7 은 `Account.without_suspended` 가 requested_deletion_at 까지 거르고, 계정 API 가
#   그 계정을 404 로 낸다. 익명화가 그 열을 채우거나 `permanently_unavailable?` 에 걸리면
#   남겨 둔 글이 피드·글 주소에서 **오류 없이** 사라진다. 거꾸로 익명화 쪽 규칙만 남기면
#   자기 삭제한 사람이 계정 API·알림에 다시 나타난다. 두 방향을 모두 묶어 둔다.
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

  # 운영진이 "글 남기고 삭제" 를 누른 경로 그대로다(Admin::AccountsController#destroy):
  # 정지한 뒤 preserve_content 로 워커를 돌린다.
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

    # 퍼블릭·태그 피드와 팔로워 전용 글의 열람은 "팔로우한 사람" 이 기준이고, 탈퇴는
    # 팔로우 관계를 지운다(DeleteAccountService 의 passive_relationships). 여기서는 계정
    # 상태 조건만 떼어 보려고 팔로우를 다시 건다 — `Account.without_suspended` 나
    # `permanently_unavailable?` 가 이 계정을 걸기 시작하면 아래 예제가 빨개진다.
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

    # Settings::DeletesController#destroy_account! 가 하는 첫 단계다. 워커가 돌기 전의
    # 삭제 대기 상태에서도 이미 보이면 안 된다.
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
