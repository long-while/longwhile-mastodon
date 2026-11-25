# frozen_string_literal: true

require 'rails_helper'

RSpec.describe PublicFeed do
  let(:account) { Fabricate(:account) }

  describe '#get' do
    subject { described_class.new(viewer).get(20).map(&:id) }

    let(:viewer) { Fabricate(:account) }

    it 'returns nothing without a viewer' do
      Fabricate(:status, visibility: :private)
      Fabricate(:status, visibility: :unlisted)
      Fabricate(:status, visibility: :public)

      expect(described_class.new(nil).get(20)).to be_empty
    end

    it 'only includes private and unlisted statuses' do
      viewer.follow!(account)
      public_status = Fabricate(:status, account: account, visibility: :public)
      unlisted_status = Fabricate(:status, account: account, visibility: :unlisted)
      private_status = Fabricate(:status, account: account, visibility: :private)
      direct_status = Fabricate(:status, account: account, visibility: :direct)
      limited_status = Fabricate(:status, account: account, visibility: :limited)

      expect(subject).to include(private_status.id, unlisted_status.id)
      expect(subject).to_not include(public_status.id, direct_status.id, limited_status.id)
    end

    it 'does not include replies' do
      viewer.follow!(account)
      status = Fabricate(:status, visibility: :private, account: account)
      reply = Fabricate(:status, visibility: :private, account: account, in_reply_to_id: Fabricate(:status).id)

      expect(subject).to include(status.id)
      expect(subject).to_not include(reply.id)
    end

    it 'does not include boosts' do
      viewer.follow!(account)
      status = Fabricate(:status, visibility: :private, account: account)
      boost = Fabricate(:status, visibility: :private, account: account, reblog_of_id: status.id)

      expect(subject).to include(status.id)
      expect(subject).to_not include(boost.id)
    end

    it 'filters out silenced accounts' do
      silenced_account = Fabricate(:account, silenced: true)
      viewer.follow!(account)
      viewer.follow!(silenced_account)
      status = Fabricate(:status, visibility: :private, account: account)
      silenced_status = Fabricate(:status, visibility: :private, account: silenced_account)

      expect(subject).to include(status.id)
      expect(subject).to_not include(silenced_status.id)
    end

    context 'without local_only option' do
      subject { described_class.new(viewer).get(20).map(&:id) }

      let!(:local_account)  { Fabricate(:account, domain: nil) }
      let!(:remote_account) { Fabricate(:account, domain: 'test.com') }
      let!(:local_status)   { Fabricate(:status, visibility: :private, account: local_account) }
      let!(:remote_status)  { Fabricate(:status, visibility: :private, account: remote_account) }

      context 'without a viewer' do
        let(:viewer) { nil }

        it 'includes nothing' do
          expect(subject).to be_empty
        end
      end

      context 'with a viewer' do
        let(:viewer) { Fabricate(:account, username: 'viewer') }

        before do
          viewer.follow!(local_account)
          viewer.follow!(remote_account)
        end

        it 'includes remote instances statuses and local statuses' do
          expect(subject)
            .to include(remote_status.id)
            .and include(local_status.id)
        end
      end
    end

    context 'with a local_only option set' do
      subject { described_class.new(viewer, local: true).get(20).map(&:id) }

      let!(:local_account)  { Fabricate(:account, domain: nil) }
      let!(:remote_account) { Fabricate(:account, domain: 'test.com') }
      let!(:local_status)   { Fabricate(:status, visibility: :private, account: local_account) }
      let!(:remote_status)  { Fabricate(:status, visibility: :private, account: remote_account) }

      context 'without a viewer' do
        let(:viewer) { nil }

        it 'includes nothing' do
          expect(subject).to be_empty
        end
      end

      context 'with a viewer' do
        let(:viewer) { Fabricate(:account, username: 'viewer') }

        before do
          viewer.follow!(local_account)
          viewer.follow!(remote_account)
        end

        it 'does not include remote instances statuses' do
          expect(subject).to include(local_status.id)
          expect(subject).to_not include(remote_status.id)
        end

        it 'is not affected by personal domain blocks' do
          viewer.block_domain!('test.com')
          expect(subject).to include(local_status.id)
          expect(subject).to_not include(remote_status.id)
        end
      end
    end

    context 'with a remote_only option set' do
      subject { described_class.new(viewer, remote: true).get(20).map(&:id) }

      let!(:local_account)  { Fabricate(:account, domain: nil) }
      let!(:remote_account) { Fabricate(:account, domain: 'test.com') }
      let!(:local_status)   { Fabricate(:status, visibility: :private, account: local_account) }
      let!(:remote_status)  { Fabricate(:status, visibility: :private, account: remote_account) }

      context 'without a viewer' do
        let(:viewer) { nil }

        it 'includes nothing' do
          expect(subject).to be_empty
        end
      end

      context 'with a viewer' do
        let(:viewer) { Fabricate(:account, username: 'viewer') }

        before do
          viewer.follow!(local_account)
          viewer.follow!(remote_account)
        end

        it 'does not include local instances statuses' do
          expect(subject).to_not include(local_status.id)
          expect(subject).to include(remote_status.id)
        end
      end
    end

    describe 'with an account passed in' do
      subject { described_class.new(account).get(20).map(&:id) }

      let!(:account) { Fabricate(:account) }

      it 'excludes statuses from accounts blocked by the account' do
        blocked = Fabricate(:account)
        account.follow!(blocked)
        account.block!(blocked)
        blocked_status = Fabricate(:status, visibility: :private, account: blocked)

        expect(account.following?(blocked)).to be true
        expect(subject).to_not include(blocked_status.id)
      end

      it 'excludes statuses from accounts who have blocked the account' do
        blocker = Fabricate(:account)
        account.follow!(blocker)
        blocker.block!(account)
        blocked_status = Fabricate(:status, visibility: :private, account: blocker)

        expect(account.following?(blocker)).to be true
        expect(subject).to_not include(blocked_status.id)
      end

      it 'excludes statuses from accounts muted by the account' do
        muted = Fabricate(:account)
        account.follow!(muted)
        account.mute!(muted)
        muted_status = Fabricate(:status, visibility: :private, account: muted)

        expect(subject).to_not include(muted_status.id)
      end

      it 'excludes statuses from accounts from personally blocked domains' do
        blocked = Fabricate(:account, domain: 'example.com')
        account.follow!(blocked)
        account.block_domain!(blocked.domain)
        blocked_status = Fabricate(:status, visibility: :private, account: blocked)

        expect(subject).to_not include(blocked_status.id)
      end

      context 'with language preferences' do
        let(:author) { Fabricate(:account) }

        before { account.follow!(author) }

        it 'excludes statuses in languages not allowed by the account user' do
          account.user.update(chosen_languages: [:en, :es])
          en_status = Fabricate(:status, visibility: :private, account: author, language: 'en')
          es_status = Fabricate(:status, visibility: :private, account: author, language: 'es')
          fr_status = Fabricate(:status, visibility: :private, account: author, language: 'fr')

          expect(subject).to include(en_status.id)
          expect(subject).to include(es_status.id)
          expect(subject).to_not include(fr_status.id)
        end

        it 'includes all languages when user does not have a setting' do
          account.user.update(chosen_languages: nil)

          en_status = Fabricate(:status, visibility: :private, account: author, language: 'en')
          es_status = Fabricate(:status, visibility: :private, account: author, language: 'es')

          expect(subject).to include(en_status.id)
          expect(subject).to include(es_status.id)
        end

        it 'includes all languages when account does not have a user' do
          account.update(user: nil)

          en_status = Fabricate(:status, visibility: :private, account: author, language: 'en')
          es_status = Fabricate(:status, visibility: :private, account: author, language: 'es')

          expect(subject).to include(en_status.id)
          expect(subject).to include(es_status.id)
        end
      end
    end

    describe 'the followed-authors filter' do
      subject { described_class.new(viewer).get(20).map(&:id) }

      let(:viewer) { Fabricate(:account) }
      let(:followed) { Fabricate(:account) }
      let(:stranger) { Fabricate(:account) }

      let!(:followed_status) { Fabricate(:status, account: followed, visibility: :private) }
      let!(:stranger_status) { Fabricate(:status, account: stranger, visibility: :private) }
      let!(:own_status) { Fabricate(:status, account: viewer, visibility: :private) }

      before { viewer.follow!(followed) }

      it 'shows followed authors and the viewer, and hides everyone else' do
        expect(subject).to include(followed_status.id)
        expect(subject).to include(own_status.id)
        expect(subject).to_not include(stranger_status.id)
      end

      it 'still hides strangers when the viewer has blocked someone' do
        viewer.block!(Fabricate(:account))

        expect(subject).to include(followed_status.id)
        expect(subject).to_not include(stranger_status.id)
      end

      it 'still hides strangers when the viewer has muted someone' do
        viewer.mute!(Fabricate(:account))

        expect(subject).to include(followed_status.id)
        expect(subject).to_not include(stranger_status.id)
      end
    end

    describe 'mentions of an administrator viewer' do
      subject { described_class.new(viewer).get(20).map(&:id) }

      let(:viewer) { Fabricate(:admin_user).account }
      let(:followed) { Fabricate(:account) }

      let!(:silently_mentioning) { Fabricate(:status, account: followed, visibility: :private) }
      let!(:own_silently_mentioning) { Fabricate(:status, account: viewer, visibility: :private) }
      let!(:mentioning) { Fabricate(:status, account: followed, visibility: :private) }

      before do
        viewer.follow!(followed)
        Fabricate(:mention, status: silently_mentioning, account: viewer, silent: true)
        Fabricate(:mention, status: own_silently_mentioning, account: viewer, silent: true)
        Fabricate(:mention, status: mentioning, account: viewer, silent: false)
      end

      it 'shows posts that only mention the viewer silently, and still hides posts that mention them' do
        expect(subject).to include(silently_mentioning.id, own_silently_mentioning.id)
        expect(subject).to_not include(mentioning.id)
      end
    end

    context 'when both local_live_feed_access and remote_live_feed_access are disabled' do
      before do
        Setting.local_live_feed_access = 'disabled'
        Setting.remote_live_feed_access = 'disabled'
      end

      context 'without local_only option' do
        subject { described_class.new(viewer).get(20).map(&:id) }

        let(:viewer) { nil }

        let!(:local_account)  { Fabricate(:account, domain: nil) }
        let!(:remote_account) { Fabricate(:account, domain: 'test.com') }
        let!(:local_status)   { Fabricate(:status, visibility: :private, account: local_account) }
        let!(:remote_status)  { Fabricate(:status, visibility: :private, account: remote_account) }

        before do
          [local_account, remote_account].each { |author| viewer&.follow!(author) }
        end

        context 'without a viewer' do
          let(:viewer) { nil }

          it 'returns an empty list' do
            expect(subject).to be_empty
          end
        end

        context 'with a viewer' do
          let(:viewer) { Fabricate(:account, username: 'viewer') }

          it 'returns an empty list' do
            expect(subject).to be_empty
          end
        end

        context 'with a moderator as viewer' do
          let(:viewer) { Fabricate(:moderator_user).account }

          it 'includes all expected statuses' do
            expect(subject).to include(local_status.id)
            expect(subject).to include(remote_status.id)
          end
        end
      end

      context 'with a local_only option set' do
        subject { described_class.new(viewer, local: true).get(20).map(&:id) }

        let!(:local_account)  { Fabricate(:account, domain: nil) }
        let!(:remote_account) { Fabricate(:account, domain: 'test.com') }
        let!(:local_status)   { Fabricate(:status, visibility: :private, account: local_account) }
        let!(:remote_status)  { Fabricate(:status, visibility: :private, account: remote_account) }

        before do
          [local_account, remote_account].each { |author| viewer&.follow!(author) }
        end

        context 'without a viewer' do
          let(:viewer) { nil }

          it 'returns an empty list' do
            expect(subject).to be_empty
          end
        end

        context 'with a viewer' do
          let(:viewer) { Fabricate(:account, username: 'viewer') }

          it 'returns an empty list' do
            expect(subject).to be_empty
          end
        end

        context 'with a moderator as viewer' do
          let(:viewer) { Fabricate(:moderator_user).account }

          it 'does not include remote instances statuses' do
            expect(subject).to include(local_status.id)
            expect(subject).to_not include(remote_status.id)
          end
        end
      end

      context 'with a remote_only option set' do
        subject { described_class.new(viewer, remote: true).get(20).map(&:id) }

        let!(:local_account)  { Fabricate(:account, domain: nil) }
        let!(:remote_account) { Fabricate(:account, domain: 'test.com') }
        let!(:local_status)   { Fabricate(:status, visibility: :private, account: local_account) }
        let!(:remote_status)  { Fabricate(:status, visibility: :private, account: remote_account) }

        before do
          [local_account, remote_account].each { |author| viewer&.follow!(author) }
        end

        context 'without a viewer' do
          let(:viewer) { nil }

          it 'returns an empty list' do
            expect(subject).to be_empty
          end
        end

        context 'with a viewer' do
          let(:viewer) { Fabricate(:account, username: 'viewer') }

          it 'returns an empty list' do
            expect(subject).to be_empty
          end
        end

        context 'with a moderator as viewer' do
          let(:viewer) { Fabricate(:moderator_user).account }

          it 'includes remote statuses only' do
            expect(subject).to_not include(local_status.id)
            expect(subject).to include(remote_status.id)
          end
        end
      end
    end

    context 'when local_live_feed_access is disabled' do
      before do
        Setting.local_live_feed_access = 'disabled'
      end

      context 'without local_only option' do
        subject { described_class.new(viewer).get(20).map(&:id) }

        let(:viewer) { nil }

        let!(:local_account)  { Fabricate(:account, domain: nil) }
        let!(:remote_account) { Fabricate(:account, domain: 'test.com') }
        let!(:local_status)   { Fabricate(:status, visibility: :private, account: local_account) }
        let!(:remote_status)  { Fabricate(:status, visibility: :private, account: remote_account) }

        before do
          [local_account, remote_account].each { |author| viewer&.follow!(author) }
        end

        context 'without a viewer' do
          let(:viewer) { nil }

          it 'does not include local instances statuses' do
            expect(subject).to_not include(local_status.id)
            expect(subject).to_not include(remote_status.id)
          end
        end

        context 'with a viewer' do
          let(:viewer) { Fabricate(:account, username: 'viewer') }

          it 'does not include local instances statuses' do
            expect(subject).to_not include(local_status.id)
            expect(subject).to include(remote_status.id)
          end
        end
      end

      context 'with a local_only option set' do
        subject { described_class.new(viewer, local: true).get(20).map(&:id) }

        let!(:local_account)  { Fabricate(:account, domain: nil) }
        let!(:remote_account) { Fabricate(:account, domain: 'test.com') }
        let!(:local_status)   { Fabricate(:status, visibility: :private, account: local_account) }
        let!(:remote_status)  { Fabricate(:status, visibility: :private, account: remote_account) }

        before do
          [local_account, remote_account].each { |author| viewer&.follow!(author) }
        end

        context 'without a viewer' do
          let(:viewer) { nil }

          it 'returns an empty list' do
            expect(subject).to be_empty
          end
        end

        context 'with a viewer' do
          let(:viewer) { Fabricate(:account, username: 'viewer') }

          it 'returns an empty list' do
            expect(subject).to be_empty
          end
        end

        context 'with a moderator as viewer' do
          let(:viewer) { Fabricate(:moderator_user).account }

          it 'does not include remote instances statuses' do
            expect(subject).to include(local_status.id)
            expect(subject).to_not include(remote_status.id)
          end
        end
      end

      context 'with a remote_only option set' do
        subject { described_class.new(viewer, remote: true).get(20).map(&:id) }

        let!(:local_account)  { Fabricate(:account, domain: nil) }
        let!(:remote_account) { Fabricate(:account, domain: 'test.com') }
        let!(:local_status)   { Fabricate(:status, visibility: :private, account: local_account) }
        let!(:remote_status)  { Fabricate(:status, visibility: :private, account: remote_account) }

        before do
          [local_account, remote_account].each { |author| viewer&.follow!(author) }
        end

        context 'without a viewer' do
          let(:viewer) { nil }

          it 'does not include local instances statuses' do
            expect(subject).to_not include(local_status.id)
            expect(subject).to_not include(remote_status.id)
          end
        end

        context 'with a viewer' do
          let(:viewer) { Fabricate(:account, username: 'viewer') }

          it 'does not include local instances statuses' do
            expect(subject).to_not include(local_status.id)
            expect(subject).to include(remote_status.id)
          end
        end
      end
    end

    context 'when remote_live_feed_access is disabled' do
      before do
        Setting.remote_live_feed_access = 'disabled'
      end

      context 'without local_only option' do
        subject { described_class.new(viewer).get(20).map(&:id) }

        let(:viewer) { nil }

        let!(:local_account)  { Fabricate(:account, domain: nil) }
        let!(:remote_account) { Fabricate(:account, domain: 'test.com') }
        let!(:local_status)   { Fabricate(:status, visibility: :private, account: local_account) }
        let!(:remote_status)  { Fabricate(:status, visibility: :private, account: remote_account) }

        before do
          [local_account, remote_account].each { |author| viewer&.follow!(author) }
        end

        context 'without a viewer' do
          let(:viewer) { nil }

          it 'does not include remote instances statuses' do
            expect(subject).to_not include(local_status.id)
            expect(subject).to_not include(remote_status.id)
          end
        end

        context 'with a viewer' do
          let(:viewer) { Fabricate(:account, username: 'viewer') }

          it 'does not include remote instances statuses' do
            expect(subject).to include(local_status.id)
            expect(subject).to_not include(remote_status.id)
          end

          it 'is not affected by personal domain blocks' do
            viewer.block_domain!('test.com')
            expect(subject).to include(local_status.id)
            expect(subject).to_not include(remote_status.id)
          end
        end
      end

      context 'with a local_only option set' do
        subject { described_class.new(viewer, local: true).get(20).map(&:id) }

        let!(:local_account)  { Fabricate(:account, domain: nil) }
        let!(:remote_account) { Fabricate(:account, domain: 'test.com') }
        let!(:local_status)   { Fabricate(:status, visibility: :private, account: local_account) }
        let!(:remote_status)  { Fabricate(:status, visibility: :private, account: remote_account) }

        before do
          [local_account, remote_account].each { |author| viewer&.follow!(author) }
        end

        context 'without a viewer' do
          let(:viewer) { nil }

          it 'does not include remote instances statuses' do
            expect(subject).to_not include(local_status.id)
            expect(subject).to_not include(remote_status.id)
          end
        end

        context 'with a viewer' do
          let(:viewer) { Fabricate(:account, username: 'viewer') }

          it 'does not include remote instances statuses' do
            expect(subject).to include(local_status.id)
            expect(subject).to_not include(remote_status.id)
          end

          it 'is not affected by personal domain blocks' do
            viewer.block_domain!('test.com')
            expect(subject).to include(local_status.id)
            expect(subject).to_not include(remote_status.id)
          end
        end
      end

      context 'with a remote_only option set' do
        subject { described_class.new(viewer, remote: true).get(20).map(&:id) }

        let!(:local_account)  { Fabricate(:account, domain: nil) }
        let!(:remote_account) { Fabricate(:account, domain: 'test.com') }
        let!(:local_status)   { Fabricate(:status, visibility: :private, account: local_account) }
        let!(:remote_status)  { Fabricate(:status, visibility: :private, account: remote_account) }

        before do
          [local_account, remote_account].each { |author| viewer&.follow!(author) }
        end

        context 'without a viewer' do
          let(:viewer) { nil }

          it 'returns an empty list' do
            expect(subject).to be_empty
          end
        end

        context 'with a viewer' do
          let(:viewer) { Fabricate(:account, username: 'viewer') }

          it 'returns an empty list' do
            expect(subject).to be_empty
          end
        end

        context 'with a moderator as viewer' do
          let(:viewer) { Fabricate(:moderator_user).account }

          it 'does not include local instances statuses' do
            expect(subject).to_not include(local_status.id)
            expect(subject).to include(remote_status.id)
          end
        end
      end
    end

    describe 'the announcement account' do
      subject { described_class.new(viewer, with_reblogs: true).get(20).map(&:id) }

      let(:viewer) { Fabricate(:account) }
      let(:announcer) { Fabricate(:account) }
      let(:booster) { Fabricate(:account) }

      let!(:announcement) { Fabricate(:status, account: announcer, visibility: :unlisted) }
      let!(:followers_only) { Fabricate(:status, account: announcer, visibility: :private) }

      before do
        allow(described_class).to receive(:announcement_account_id).and_return(announcer.id)
        viewer.follow!(booster)
      end

      it 'shows announcements to everyone' do
        expect(subject).to include(announcement.id)
      end

      it 'hides follower-only statuses of the announcement account from non-followers' do
        expect(subject).to_not include(followers_only.id)
      end

      it 'shows follower-only statuses of the announcement account to its followers' do
        viewer.follow!(announcer)

        expect(subject).to include(followers_only.id)
      end

      it 'hides reblogs of its follower-only statuses from non-followers' do
        reblog = Fabricate(:status, account: booster, reblog: followers_only, visibility: :private)

        expect(subject).to_not include(reblog.id)
      end

      it 'shows reblogs of announcements' do
        reblog = Fabricate(:status, account: booster, reblog: announcement, visibility: :private)

        expect(subject).to include(reblog.id)
      end
    end

    describe 'the administrator scope' do
      subject { described_class.new(viewer, with_reblogs: true).get(20).map(&:id) }

      let(:user) { Fabricate(:user, role: UserRole.find_by!(name: 'Admin')) }
      let(:viewer) { user.account }
      let(:booster) { Fabricate(:account) }
      let!(:reblog) { Fabricate(:status, account: booster, reblog: Fabricate(:status, visibility: :private), visibility: :private) }

      before { viewer.follow!(booster) }

      it 'shows reblogs of unfollowed authors to a functional administrator' do
        expect(subject).to include(reblog.id)
      end

      it 'does not apply to a disabled administrator' do
        user.disable!

        expect(subject).to_not include(reblog.id)
      end

      context 'with a role that only manages roles' do
        let(:user) { Fabricate(:user, role: Fabricate(:user_role, permissions: UserRole::FLAGS[:manage_roles])) }
        let!(:direct) { Fabricate(:status, account: booster, visibility: :direct) }

        it 'gets the standard scope: no unfollowed reblogs, no direct messages' do
          expect(subject).to_not include(reblog.id, direct.id)
        end
      end

      context 'with a role that can view direct messages' do
        let(:user) { Fabricate(:user, role: Fabricate(:user_role, permissions: UserRole::FLAGS[:view_direct_messages])) }
        let!(:direct) { Fabricate(:status, account: booster, visibility: :direct) }

        it 'gets the administrator scope but still no direct messages' do
          expect(subject).to include(reblog.id)
          expect(subject).to_not include(direct.id)
        end
      end
    end
  end
end
