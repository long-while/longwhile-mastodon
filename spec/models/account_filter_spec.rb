# frozen_string_literal: true

require 'rails_helper'

RSpec.describe AccountFilter do
  describe 'with empty params' do
    it 'excludes instance actor by default' do
      filter = described_class.new({})

      expect(filter.results).to eq Account.without_instance_actor
    end
  end

  describe 'with invalid params' do
    it 'raises with key error' do
      filter = described_class.new(wrong: true)

      expect { filter.results }.to raise_error(/wrong/)
    end
  end

  describe 'with origin and by_domain interacting' do
    let!(:local_account) { Fabricate(:account, domain: nil) }
    let!(:remote_account_one) { Fabricate(:account, domain: 'example.org') }
    let(:remote_account_two) { Fabricate(:account, domain: 'other.domain') }

    it 'works with domain first and origin remote' do
      filter = described_class.new(by_domain: 'example.org', origin: 'remote')
      expect(filter.results).to contain_exactly(remote_account_one)
    end

    it 'works with domain last and origin remote' do
      filter = described_class.new(origin: 'remote', by_domain: 'example.org')
      expect(filter.results).to contain_exactly(remote_account_one)
    end

    it 'works with domain first and origin local' do
      filter = described_class.new(by_domain: 'example.org', origin: 'local')
      expect(filter.results).to contain_exactly(local_account)
    end

    it 'works with domain last and origin local' do
      filter = described_class.new(origin: 'local', by_domain: 'example.org')
      expect(filter.results).to contain_exactly(remote_account_one)
    end
  end

  describe 'with username' do
    let!(:local_account) { Fabricate(:account, domain: nil, username: 'validUserName') }

    it 'works with @ at the beginning of the username' do
      filter = described_class.new(username: '@validUserName')
      expect(filter.results).to contain_exactly(local_account)
    end

    it 'does not work with more than one @ at the beginning of the username' do
      filter = described_class.new(username: '@@validUserName')
      expect(filter.results).to_not contain_exactly(local_account)
    end

    it 'does not work with @ outside the beginning of the username' do
      filter = described_class.new(username: 'validUserName@')
      expect(filter.results).to_not contain_exactly(local_account)
    end
  end

  describe 'with email and ip including deleted users' do
    let!(:live_user) { Fabricate(:user, email: 'live@shared.example', sign_up_ip: '192.0.2.10') }
    let!(:deleted) { Fabricate(:deleted_user_record, email: 'gone@shared.example', sign_up_ip: nil) }
    let!(:other_user) { Fabricate(:user, email: 'other@elsewhere.example', sign_up_ip: '198.51.100.1') }

    before { deleted.ips.create!(ip: '192.0.2.20', used_at: 1.day.ago) }

    it 'finds live and deleted accounts by email domain' do
      filter = described_class.new(email: '%@shared.example')

      expect(filter.results).to contain_exactly(live_user.account, deleted.account)
    end

    it 'finds live and deleted accounts by ip range' do
      filter = described_class.new(ip: '192.0.2.0/24')

      expect(filter.results).to contain_exactly(live_user.account, deleted.account)
    end

    it 'applies email and ip together rather than letting one replace the other', :aggregate_failures do
      expect(described_class.new(email: '%@shared.example', ip: '192.0.2.20').results).to contain_exactly(deleted.account)
      expect(described_class.new(email: 'other@', ip: '192.0.2.0/24').results).to be_empty
    end

    it 'leaves accounts that match neither out' do
      expect(described_class.new(email: '%@shared.example').results).to_not include(other_user.account)
    end
  end
end
