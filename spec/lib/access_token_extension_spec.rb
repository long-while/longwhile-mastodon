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
  end

  describe '.long_lived_refresh' do
    it 'returns only long-lived refresh tokens' do
      long_lived = Fabricate(:access_token, long_lived: true, purpose: 'multi_account_refresh')
      Fabricate(:access_token, long_lived: false)

      expect(Doorkeeper::AccessToken.long_lived_refresh).to contain_exactly(long_lived)
    end
  end
end

