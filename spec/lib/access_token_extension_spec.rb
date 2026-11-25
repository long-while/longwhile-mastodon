# frozen_string_literal: true

require 'rails_helper'

RSpec.describe AccessTokenExtension do
  describe '#expired?' do
    it 'returns false for long-lived refresh tokens regardless of timestamp' do
      token =
        Fabricate(
          :access_token,
          expires_in: 60,
          created_at: 2.days.ago,
          long_lived: true,
          purpose: 'multi_account_refresh'
        )

      expect(token.expired?).to be(false)
    end

    it 'delegates to the base implementation for standard tokens' do
      token = Fabricate(:access_token, expires_in: 60, created_at: 2.days.ago, long_lived: false)

      expect(token.expired?).to be(true)
    end
  end

  describe '.excluding_long_lived_refresh' do
    it 'filters out long-lived refresh tokens' do
      long_lived = Fabricate(:access_token, long_lived: true, purpose: 'multi_account_refresh')
      regular    = Fabricate(:access_token, long_lived: false)

      expect(Doorkeeper::AccessToken.excluding_long_lived_refresh).to include(regular)
      expect(Doorkeeper::AccessToken.excluding_long_lived_refresh).not_to include(long_lived)
    end

    it 'keeps long-lived tokens whose purpose is NULL' do
      without_purpose = Fabricate(:access_token, long_lived: true, purpose: nil)

      expect(Doorkeeper::AccessToken.excluding_long_lived_refresh).to include(without_purpose)
    end
  end

  describe '.expired' do
    it 'includes an expired long-lived token whose purpose is NULL' do
      token = Fabricate(:access_token, long_lived: true, purpose: nil, expires_in: 60, created_at: 2.days.ago)

      expect(Doorkeeper::AccessToken.expired).to include(token)
    end

    it 'never includes long-lived refresh tokens' do
      token = Fabricate(:access_token, long_lived: true, purpose: 'multi_account_refresh', expires_in: 60, created_at: 2.days.ago)

      expect(Doorkeeper::AccessToken.expired).to_not include(token)
    end
  end

  describe '.multi_account_owned' do
    let(:multi_account_app) { Fabricate(:application) }

    around do |example|
      original = Rails.configuration.x.multi_account.dup
      example.run
      Rails.configuration.x.multi_account = ActiveSupport::HashWithIndifferentAccess.new(original)
    end

    it 'covers flagged tokens and legacy tokens of the multi-account application' do
      Rails.configuration.x.multi_account[:client_id] = multi_account_app.uid
      flagged = Fabricate(:access_token, multi_account: true)
      long_lived = Fabricate(:access_token, long_lived: true, purpose: 'multi_account_refresh')
      legacy = Fabricate(:access_token, application: multi_account_app)
      regular = Fabricate(:access_token)

      expect(Doorkeeper::AccessToken.multi_account_owned).to include(flagged, long_lived, legacy)
      expect(Doorkeeper::AccessToken.multi_account_owned).to_not include(regular)
    end

    it 'still works when no multi-account application is configured' do
      Rails.configuration.x.multi_account[:client_id] = nil
      flagged = Fabricate(:access_token, multi_account: true)

      expect(Doorkeeper::AccessToken.multi_account_owned).to contain_exactly(flagged)
    end
  end

  describe '.long_lived_refresh' do
    it 'returns only long-lived refresh tokens' do
      long_lived = Fabricate(:access_token, long_lived: true, purpose: 'multi_account_refresh')
      Fabricate(:access_token, long_lived: false)

      expect(Doorkeeper::AccessToken.long_lived_refresh).to contain_exactly(long_lived)
    end
  end
end

