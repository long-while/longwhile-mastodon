# frozen_string_literal: true

require 'rails_helper'

# @_longwhile custom feature
RSpec.describe Status do
  let(:account) { Fabricate(:account) }

  describe '#rate_limiter' do
    subject { status.rate_limiter(account, family: :statuses) }

    context 'with a direct status' do
      let(:status) { Fabricate.build(:status, account: account, visibility: :direct) }

      it 'uses the direct family' do
        expect(subject.instance_variable_get(:@family)).to eq :direct_statuses
      end

      it 'memoizes so that record and rollback hit the same family' do
        first = status.rate_limiter(account, family: :statuses)

        expect(status.rate_limiter(account, family: :statuses)).to be first
      end
    end

    context 'with a public status' do
      let(:status) { Fabricate.build(:status, account: account, visibility: :public) }

      it 'keeps the shared statuses family' do
        expect(subject.instance_variable_get(:@family)).to eq :statuses
      end
    end

    context 'with an unlisted status' do
      let(:status) { Fabricate.build(:status, account: account, visibility: :unlisted) }

      it 'keeps the shared statuses family' do
        expect(subject.instance_variable_get(:@family)).to eq :statuses
      end
    end

    context 'with a private status' do
      let(:status) { Fabricate.build(:status, account: account, visibility: :private) }

      it 'keeps the shared statuses family' do
        expect(subject.instance_variable_get(:@family)).to eq :statuses
      end
    end
  end

  describe 'RateLimiter::FAMILIES' do
    it 'leaves the public posting limit untouched' do
      expect(RateLimiter::FAMILIES[:statuses]).to eq(limit: 300, period: 3.hours)
    end

    it 'defines a separate direct family' do
      expect(RateLimiter::FAMILIES[:direct_statuses][:limit]).to be_positive
    end
  end
end
