# frozen_string_literal: true

require 'rails_helper'

RSpec.describe AccountDeletionWorker do
  describe '#perform' do
    it 'destroys the user of a self-deleted account but keeps their email and IPs', :aggregate_failures do
      user = Fabricate(:user, email: 'leaver@example.com', sign_up_ip: '192.0.2.1')
      account = user.account
      account.mark_deleted!

      described_class.new.perform(account.id)

      expect(User.find_by(id: user.id)).to be_nil
      expect(Account.find_by(id: account.id)).to_not be_nil
      expect(account.reload.deleted_user_record).to have_attributes(email: 'leaver@example.com')
      expect(account.deleted_user_record.ips.map { |ip| ip.ip.to_s }).to eq ['192.0.2.1']
    end
  end
end
