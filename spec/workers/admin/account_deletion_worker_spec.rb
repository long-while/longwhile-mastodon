# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Admin::AccountDeletionWorker do
  let(:worker) { described_class.new }

  describe 'perform' do
    let(:account) { Fabricate(:account) }
    let(:service) { instance_double(DeleteAccountService, call: true) }

    it 'calls delete account service' do
      allow(DeleteAccountService).to receive(:new).and_return(service)
      worker.perform(account.id)

      expect(service).to have_received(:call).with(account, { reserve_email: true, reserve_username: true, preserve_content: false })
    end

    it 'passes the anonymisation request through' do
      allow(DeleteAccountService).to receive(:new).and_return(service)
      worker.perform(account.id, { 'preserve_content' => true })

      expect(service).to have_received(:call).with(account, { reserve_email: true, reserve_username: true, preserve_content: true })
    end
  end
end
