# frozen_string_literal: true

require 'rails_helper'

RSpec.describe DeletedUserRecord do
  describe '.capture!' do
    let(:user) { Fabricate(:user, email: 'someone@example.com', sign_up_ip: '192.0.2.1') }

    it 'replaces an earlier capture of the same account instead of adding another', :aggregate_failures do
      described_class.capture!(user)
      Fabricate(:login_activity, user: user, ip: '198.51.100.7')
      described_class.capture!(user)

      expect(described_class.where(account_id: user.account_id).count).to eq 1
      expect(DeletedUserIp.count).to eq 2
    end

    it 'records an unconfirmed email as such' do
      user.update!(confirmed_at: nil)

      expect(described_class.capture!(user).confirmed?).to be false
    end
  end

  describe '.expired' do
    it 'returns records older than the retention period' do
      old = Fabricate(:deleted_user_record, created_at: (described_class::RETENTION_PERIOD + 1.day).ago)
      Fabricate(:deleted_user_record, created_at: 1.day.ago)

      expect(described_class.expired).to contain_exactly(old)
    end
  end

  describe '#email_domain' do
    it 'returns the part after the at sign' do
      expect(described_class.new(email: 'luxintenebris.1794.s+4@gmail.com').email_domain).to eq 'gmail.com'
    end
  end

  describe '#expires_at' do
    it 'is six months after the deletion' do
      record = described_class.new(created_at: Time.zone.parse('2026-11-09 12:00'))

      expect(record.expires_at).to eq Time.zone.parse('2027-05-09 12:00')
    end
  end
end
