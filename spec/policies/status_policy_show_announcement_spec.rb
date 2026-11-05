# frozen_string_literal: true

require 'rails_helper'

# unlisted 는 공지 계정 전용이고, 그 글은 팔로우 여부와 무관하게 모든 로컬 계정에 간다
# (943745d134 — FanOutOnWriteService#announcement_broadcast?, PublicFeed). 그런데 글 주소는
# StatusPolicy 가 unlisted 를 팔로워 전용으로 막아, 피드에는 보이는 공지가 열면 404 였다.
# 다른 계정의 unlisted(943745d134 이전 기본값으로 쓴 옛 글)는 계속 팔로워 전용이어야 한다.
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
