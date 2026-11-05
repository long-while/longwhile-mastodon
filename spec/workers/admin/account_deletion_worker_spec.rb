# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Admin::AccountDeletionWorker do
  let(:worker) { described_class.new }

  describe 'perform' do
    let(:account) { Fabricate(:account, suspended: true) }
    let(:service) { instance_double(DeleteAccountService, call: true) }

    it 'calls delete account service' do
      allow(DeleteAccountService).to receive(:new).and_return(service)
      worker.perform(account.id)

      expect(service).to have_received(:call).with(account, { reserve_email: true, reserve_username: true, preserve_content: false, suspended_at: account.reload.suspended_at })
    end

    it 'passes the anonymisation request through without a suspension date' do
      allow(DeleteAccountService).to receive(:new).and_return(service)
      worker.perform(account.id, { 'preserve_content' => true })

      expect(service).to have_received(:call).with(account, { reserve_email: true, reserve_username: true, preserve_content: true })
    end
  end
end
