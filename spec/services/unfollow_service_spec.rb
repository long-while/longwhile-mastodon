# frozen_string_literal: true

require 'rails_helper'

RSpec.describe UnfollowService do
  subject { described_class.new }

  let(:sender) { Fabricate(:account, username: 'alice') }

  describe 'local' do
    let(:bob) { Fabricate(:account, username: 'bob') }

    before { sender.follow!(bob) }

    it 'destroys the following relation' do
      subject.call(sender, bob)

      expect(sender)
        .to_not be_following(bob)
    end

    context 'when the unfollowed account is a member of one of the unfollower\'s lists' do
      let(:list) { Fabricate(:list, account: sender) }

      before { list.accounts << bob }

      # The list_accounts row is removed by an ON DELETE CASCADE foreign key the
      # moment the follow is destroyed, so the worker must be enqueued from data
      # captured *before* the destroy, otherwise the posts linger in the list.
      it 'schedules removal of the unfollowed account posts from the list' do
        expect { subject.call(sender, bob) }
          .to enqueue_sidekiq_job(UnmergeWorker).with(bob.id, list.id, 'list')
      end
    end
  end

  describe 'remote ActivityPub', :inline_jobs do
    let(:bob) { Fabricate(:account, username: 'bob', protocol: :activitypub, domain: 'example.com', inbox_url: 'http://example.com/inbox') }

    before do
      sender.follow!(bob)
      stub_request(:post, 'http://example.com/inbox').to_return(status: 200)
    end

    it 'destroys the following relation and sends unfollow activity' do
      subject.call(sender, bob)

      expect(sender)
        .to_not be_following(bob)
      expect(a_request(:post, 'http://example.com/inbox'))
        .to have_been_made.once
    end
  end

  describe 'remote ActivityPub (reverse)', :inline_jobs do
    let(:bob) { Fabricate(:account, username: 'bob', protocol: :activitypub, domain: 'example.com', inbox_url: 'http://example.com/inbox') }

    before do
      bob.follow!(sender)
      stub_request(:post, 'http://example.com/inbox').to_return(status: 200)
    end

    it 'destroys the following relation and sends a reject activity' do
      subject.call(bob, sender)

      expect(sender)
        .to_not be_following(bob)
      expect(a_request(:post, 'http://example.com/inbox'))
        .to have_been_made.once
    end
  end
end
