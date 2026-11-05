# frozen_string_literal: true

require 'rails_helper'

RSpec.describe MultiAccounts::RefreshService do
  subject(:service_call) { described_class.new(refresh_token: refresh_token, request: request).call }

  let(:request) { instance_double(ActionDispatch::Request, remote_ip: '127.0.0.1') }
  let(:application) { Doorkeeper::Application.create!(name: 'MultiAccount', redirect_uri: 'https://example.com/callback') }
  let(:user) { Fabricate(:user) }
  let(:refresh_token_record) do
    Fabricate(
      :access_token,
      application: application,
      resource_owner_id: user.id,
      scopes: 'read',
      multi_account: true,
      purpose: 'multi_account_refresh',
      long_lived: true,
      revoked_at: nil
    )
  end
  let(:refresh_token) { refresh_token_record.token }
  let(:rate_limiter) { instance_double(RateLimiter, record!: true, rollback!: true) }

  before do
    allow(RateLimiter).to receive(:new).and_return(rate_limiter)
    allow(request).to receive(:remote_ip).and_return('127.0.0.1')
  end

  describe '#call' do
    context 'with a valid long-lived refresh token' do
      it 'creates a new session token with multi-account flag' do
        result = service_call

        expect(result.access_token).to be_persisted
        expect(result.access_token.multi_account).to be(true)
        expect(result.access_token.long_lived).to be(false)
        expect(result.access_token.purpose).to eq('multi_account_session')
        expect(result.access_token.resource_owner_id).to eq(user.id)
        expect(result.account).to eq(user.account)
        expect(RateLimiter).to have_received(:new).with(user, family: :multi_account_refresh)
        expect(rate_limiter).to have_received(:record!)
      end
    end

    # 4.7 부터 자기 삭제는 정지가 아니라 `requested_deletion_at` 만 채운다(`mark_deleted!`).
    # 삭제 작업이 돌기 전까지 저장된 갱신 토큰이 살아 있다.
    context 'when the account has requested its own deletion' do
      before { user.account.mark_deleted! }

      it 'raises an error with status 403 without issuing a session token' do
        expect { service_call }.to raise_error(MultiAccounts::RefreshService::Error) { |error|
          expect(error.status).to eq(403)
        }
        expect(Doorkeeper::AccessToken.where(purpose: 'multi_account_session')).to be_empty
      end
    end

    context 'when the refresh token is invalid' do
      let(:refresh_token) { 'invalid' }

      it 'raises an error with status 401' do
        expect { service_call }.to raise_error(MultiAccounts::RefreshService::Error) { |error|
          expect(error.status).to eq(401)
        }
      end
    end

    context 'when the refresh token is not long-lived' do
      before do
        refresh_token_record.update!(long_lived: false, purpose: nil)
      end

      # @_longwhile — 회귀: 자동 승격이 `multi_account` 플래그만 보던 때는
      #   다른 앱이 발급한 토큰까지 올려 주어 이 검사가 조용히 깨져 있었다.
      it 'raises an error with status 422' do
        expect { service_call }.to raise_error(MultiAccounts::RefreshService::Error) { |error|
          expect(error.status).to eq(422)
        }
      end

      it 'does not upgrade the token' do
        expect { service_call }.to raise_error(MultiAccounts::RefreshService::Error)

        expect(refresh_token_record.reload).to have_attributes(long_lived: false, purpose: nil)
      end

      context 'when the token was issued by the multi-account application' do
        around do |example|
          original = Rails.configuration.x.multi_account.dup
          Rails.configuration.x.multi_account[:client_id] = application.uid
          example.run
          Rails.configuration.x.multi_account = ActiveSupport::HashWithIndifferentAccess.new(original)
        end

        # 옛 버전의 `consume` 는 플래그를 박지 않았다. 그런 토큰은 쓸 수 있어야 한다.
        it 'upgrades the legacy token instead of rejecting it' do
          expect { service_call }.to_not raise_error

          expect(refresh_token_record.reload).to have_attributes(
            long_lived: true,
            purpose: 'multi_account_refresh',
            multi_account: true
          )
        end
      end
    end

    # @_longwhile — 전환으로 나간 세션 토큰은 다중 계정 앱 소유에
    #   `multi_account: true` 라, 표식이 없으면 자동 승격에 걸려 **10년짜리
    #   갱신 토큰**이 된다. `revoke_access!` 가 그런 토큰을 건너뛰므로
    #   로그아웃해도 안 지워진다. 전환할 때마다 하나씩 생기는 토큰이다.
    context 'when a session token from a previous switch is replayed' do
      around do |example|
        original = Rails.configuration.x.multi_account.dup
        Rails.configuration.x.multi_account[:client_id] = application.uid
        example.run
        Rails.configuration.x.multi_account = ActiveSupport::HashWithIndifferentAccess.new(original)
      end

      let(:session_token_record) do
        described_class.new(refresh_token: refresh_token, request: request).call.access_token
      end

      it 'refuses to accept it as a refresh token' do
        replayed = described_class.new(refresh_token: session_token_record.token, request: request)

        expect { replayed.call }.to raise_error(MultiAccounts::RefreshService::Error) { |error|
          expect(error.status).to eq(422)
        }

        expect(session_token_record.reload).to have_attributes(long_lived: false, purpose: 'multi_account_session')
      end
    end
  end
end
