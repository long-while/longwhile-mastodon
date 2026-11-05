# frozen_string_literal: true

require 'rails_helper'

RSpec.describe StatusPolicy, '#show?' do
  let(:announcer) do
    Fabricate.build(:account, username: PublicFeed::ANNOUNCEMENT_USERNAME).tap { |account| account.save!(validate: false) }
  end
  let(:viewer) { Fabricate(:account) }
  let(:announcement) { Fabricate(:status, account: announcer, visibility: :unlisted) }

  it 'lets any logged-in account open an announcement' do
    expect(described_class.new(viewer, announcement).show?).to be true
  end

  it 'does not let a logged-out visitor open an announcement' do
    expect(described_class.new(nil, announcement).show?).to be false
  end

  it 'does not let an account blocked by the announcement account open it' do
    announcer.block!(viewer)

    expect(described_class.new(viewer, announcement).show?).to be false
  end

  it 'keeps follower-only statuses of the announcement account follower-only' do
    followers_only = Fabricate(:status, account: announcer, visibility: :private)

    expect(described_class.new(viewer, followers_only).show?).to be false
  end

  it 'keeps unlisted statuses of other accounts follower-only' do
    old_unlisted = Fabricate(:status, visibility: :unlisted)

    expect(described_class.new(viewer, old_unlisted).show?).to be false
  end

  it 'keeps unlisted statuses of a remote account with the same username follower-only' do
    remote = Fabricate(:account, username: PublicFeed::ANNOUNCEMENT_USERNAME, domain: 'example.com')
    remote_unlisted = Fabricate(:status, account: remote, visibility: :unlisted)

    expect(described_class.new(viewer, remote_unlisted).show?).to be false
  end
end
