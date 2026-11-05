# frozen_string_literal: true

require 'rails_helper'

RSpec.describe StatusPolicy, '#show?' do
  let(:admin) { Fabricate(:admin_user).account }
  let(:direct_status) { Fabricate(:status, visibility: :direct) }
  let(:private_status) { Fabricate(:status, visibility: :private) }

  it 'lets an administrator read direct and private statuses' do
    expect(described_class.new(admin, direct_status).show?).to be true
    expect(described_class.new(admin, private_status).show?).to be true
  end

  context 'when the administrator login is disabled' do
    before { admin.user.disable! }

    it 'does not grant the administrator view' do
      expect(described_class.new(admin, direct_status).show?).to be false
      expect(described_class.new(admin, private_status).show?).to be false
    end

    it 'does not grant the administrator view of profiles' do
      Fabricate(:status, account: private_status.account, visibility: :direct)

      results = AccountStatusesFilter.new(private_status.account, admin).results
      expect(results.pluck(:visibility).uniq - %w(public)).to be_empty
    end
  end
end
