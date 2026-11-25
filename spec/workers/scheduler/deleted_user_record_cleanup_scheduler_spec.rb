# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Scheduler::DeletedUserRecordCleanupScheduler do
  let(:worker) { described_class.new }

  describe '#perform' do
    let!(:expired) { Fabricate(:deleted_user_record, created_at: 7.months.ago) }
    let!(:recent) { Fabricate(:deleted_user_record, created_at: 5.months.ago) }

    before do
      expired.ips.create!(ip: '192.0.2.1', used_at: 8.months.ago)
      recent.ips.create!(ip: '192.0.2.2', used_at: 6.months.ago)
    end

    it 'deletes records past the retention period with their IPs', :aggregate_failures do
      worker.perform

      expect(DeletedUserRecord.all).to contain_exactly(recent)
      expect(DeletedUserIp.pluck(:deleted_user_record_id)).to eq [recent.id]
      expect(Account.exists?(expired.account_id)).to be true
    end
  end
end
