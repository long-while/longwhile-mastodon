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
        expect(result.access_token.purpose).to be_nil
        expect(result.access_token.resource_owner_id).to eq(user.id)
        expect(result.account).to eq(user.account)
        expect(RateLimiter).to have_received(:new).with(user, family: :multi_account_refresh)
        expect(rate_limiter).to have_received(:record!)
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

      it 'raises an error with status 422' do
        expect { service_call }.to raise_error(MultiAccounts::RefreshService::Error) { |error|
          expect(error.status).to eq(422)
        }
      end
    end
  end
end

