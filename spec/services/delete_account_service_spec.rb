# frozen_string_literal: true

require 'rails_helper'

RSpec.describe DeleteAccountService do
  shared_examples 'common behavior' do
    subject { described_class.new.call(account) }

    let!(:status) { Fabricate(:status, account: account) }
    let!(:reported_status) { Fabricate(:status, account: account) }
    let!(:mention) { Fabricate(:mention, account: local_follower) }
    let!(:status_with_mention) { Fabricate(:status, account: account, mentions: [mention]) }
    let!(:media_attachment) { Fabricate(:media_attachment, account: account) }
    let!(:notification) { Fabricate(:notification, account: account) }
    let!(:favourite) { Fabricate(:favourite, account: account, status: Fabricate(:status, account: local_follower)) }
    let!(:poll) { Fabricate(:poll, account: account) }
    let!(:poll_vote) { Fabricate(:poll_vote, account: local_follower, poll: poll) }

    let!(:active_relationship) { Fabricate(:follow, account: account, target_account: local_follower) }
    let!(:passive_relationship) { Fabricate(:follow, account: local_follower, target_account: account) }
    let!(:endorsement) { Fabricate(:account_pin, account: local_follower, target_account: account) }

    let!(:mention_notification) { Fabricate(:notification, account: local_follower, activity: mention, type: :mention) }
    let!(:status_notification) { Fabricate(:notification, account: local_follower, activity: status, type: :status) }
    let!(:poll_notification) { Fabricate(:notification, account: local_follower, activity: poll, type: :poll) }
    let!(:favourite_notification) { Fabricate(:notification, account: local_follower, activity: favourite, type: :favourite) }
    let!(:follow_notification) { Fabricate(:notification, account: local_follower, activity: active_relationship, type: :follow) }

    let!(:account_note) { Fabricate(:account_note, account: account) }
    let!(:generated_annual_report) { Fabricate(:generated_annual_report, account: account) }

    before do
      Fabricate(:report, target_account: account, status_ids: [reported_status.id])
    end

    it 'deletes associated owned and target records and target notifications' do
      expect { subject }
        .to change { reported_status.reload.deleted_at }.from(nil)

      expect_deletion_of_associated_owned_records
      expect_deletion_of_associated_target_records
      expect_deletion_of_associated_target_notifications
    end

    def expect_deletion_of_associated_owned_records
      expect { status.reload }.to raise_error(ActiveRecord::RecordNotFound)
      expect { status_with_mention.reload }.to raise_error(ActiveRecord::RecordNotFound)
      expect { mention.reload }.to raise_error(ActiveRecord::RecordNotFound)
      expect { media_attachment.reload }.to raise_error(ActiveRecord::RecordNotFound)
      expect { notification.reload }.to raise_error(ActiveRecord::RecordNotFound)
      expect { favourite.reload }.to raise_error(ActiveRecord::RecordNotFound)
      expect { active_relationship.reload }.to raise_error(ActiveRecord::RecordNotFound)
      expect { passive_relationship.reload }.to raise_error(ActiveRecord::RecordNotFound)
      expect { poll.reload }.to raise_error(ActiveRecord::RecordNotFound)
      expect { poll_vote.reload }.to raise_error(ActiveRecord::RecordNotFound)
      expect { account_note.reload }.to raise_error(ActiveRecord::RecordNotFound)
      expect { collection.reload }.to raise_error(ActiveRecord::RecordNotFound)
      expect { generated_annual_report.reload }.to raise_error(ActiveRecord::RecordNotFound)
    end

    def expect_deletion_of_associated_target_records
      expect { endorsement.reload }.to raise_error(ActiveRecord::RecordNotFound)
    end

    def expect_deletion_of_associated_target_notifications
      expect { favourite_notification.reload }.to raise_error(ActiveRecord::RecordNotFound)
      expect { follow_notification.reload }.to raise_error(ActiveRecord::RecordNotFound)
      expect { mention_notification.reload }.to raise_error(ActiveRecord::RecordNotFound)
      expect { poll_notification.reload }.to raise_error(ActiveRecord::RecordNotFound)
      expect { status_notification.reload }.to raise_error(ActiveRecord::RecordNotFound)
    end
  end

  describe 'ASSOCIATIONS_WITHOUT_SIDE_EFFECTS' do
    it 'is a subset of ASSOCIATIONS_ON_PURGE' do
      expect(described_class::ASSOCIATIONS_WITHOUT_SIDE_EFFECTS - described_class::ASSOCIATIONS_ON_PURGE).to eq []
    end
  end

  describe '#call on local account', :inline_jobs do
    before do
      stub_request(:post, remote_alice.inbox_url).to_return(status: 201)
      stub_request(:post, remote_bob.inbox_url).to_return(status: 201)
    end

    let!(:remote_alice) { Fabricate(:account, inbox_url: 'https://alice.com/inbox', domain: 'alice.com', protocol: :activitypub) }
    let!(:remote_bob) { Fabricate(:account, inbox_url: 'https://bob.com/inbox', domain: 'bob.com', protocol: :activitypub) }

    it_behaves_like 'common behavior' do
      let(:account) { Fabricate(:account) }
      let(:local_follower) { Fabricate(:account) }
      let!(:collection) { Fabricate(:collection, account:) } # rubocop:disable RSpec/LetSetup

      it 'sends a delete actor activity to all known inboxes' do
        subject
        expect(a_request(:post, remote_alice.inbox_url)).to have_been_made.once
        expect(a_request(:post, remote_bob.inbox_url)).to have_been_made.once
      end
    end
  end

  describe '#call on remote account', :inline_jobs do
    before do
      stub_request(:post, account.inbox_url).to_return(status: 201)
    end

    it_behaves_like 'common behavior' do
      let(:account) { Fabricate(:account, inbox_url: 'https://bob.com/inbox', protocol: :activitypub, domain: 'bob.com') }
      let(:local_follower) { Fabricate(:account) }

      let!(:collection) { Fabricate(:remote_collection, account:) } # rubocop:disable RSpec/LetSetup

      it 'sends expected activities to followed and follower inboxes' do
        subject

        expect(post_to_inbox_with_reject).to have_been_made.once
        expect(post_to_inbox_with_undo).to have_been_made.once
      end

      def post_to_inbox_with_undo
        a_request(:post, account.inbox_url).with(
          body: hash_including({
            'type' => 'Undo',
            'object' => hash_including({
              'type' => 'Follow',
              'actor' => ActivityPub::TagManager.instance.uri_for(local_follower),
              'object' => account.uri,
            }),
          })
        )
      end

      def post_to_inbox_with_reject
        a_request(:post, account.inbox_url).with(
          body: hash_including({
            'type' => 'Reject',
            'object' => hash_including({
              'type' => 'Follow',
              'actor' => account.uri,
              'object' => ActivityPub::TagManager.instance.uri_for(local_follower),
            }),
          })
        )
      end
    end
  end

  describe 'anonymising instead of erasing' do
    subject { described_class.new }

    let!(:account) { Fabricate(:account) }
    let!(:status) { Fabricate(:status, account: account, text: 'still here') }

    before { subject.call(account, reserve_username: true, reserve_email: false, preserve_content: true) }

    it 'keeps the posts readable under a name that says nothing', :aggregate_failures do
      account.reload

      expect(Status.find_by(id: status.id)).to_not be_nil
      expect(account.anonymized?).to be true
      expect(account.display_name).to eq Account::ANONYMIZED_DISPLAY_NAME
    end

    it 'does not suspend the account, which would hide those posts again', :aggregate_failures do
      account.reload

      expect(account.suspended?).to be false
      # Still unavailable: nobody owns it any more.
      expect(account.unavailable?).to be true
    end

    it 'shows the posts to other accounts' do
      expect(StatusPolicy.new(Fabricate(:account), status.reload).show?).to be true
    end

    it 'refuses interaction with them', :aggregate_failures do
      policy = StatusPolicy.new(Fabricate(:account), status.reload)

      expect(policy.favourite?).to be false
      expect(policy.reblog?).to be false
    end
  end

  describe 'anonymising an account that had requested deletion' do
    subject { described_class.new }

    let!(:account) { Fabricate(:account, requested_deletion_at: 1.day.ago) }

    before { subject.call(account, reserve_username: true, reserve_email: false, preserve_content: true) }

    it 'clears the deletion mark so the kept posts stay visible', :aggregate_failures do
      account.reload

      expect(account.anonymized?).to be true
      expect(account.deleted?).to be false
      expect(Account.without_requested_deletion).to include(account)
    end
  end

  describe 'keeping the email and IPs of a user who deleted their account' do
    subject { described_class.new }

    let(:inviter) { Fabricate(:user) }
    let(:user) do
      Fabricate(:user, email: 'leaver+4@example.com', locale: 'ko', sign_up_ip: '192.0.2.1',
                       current_sign_in_at: 2.days.ago, invite: Fabricate(:invite, user: inviter))
    end
    let(:account) { user.account }

    before do
      Fabricate(:login_activity, user: user, ip: '198.51.100.7', created_at: 1.day.ago)
      Fabricate(:session_activation, user: user, ip: '203.0.113.9')
    end

    it 'archives them before destroying the user', :aggregate_failures do
      subject.call(account, reserve_username: true, reserve_email: false)

      expect(User.find_by(id: user.id)).to be_nil
      record = DeletedUserRecord.find_by(account_id: account.id)
      expect(record).to have_attributes(email: 'leaver+4@example.com', locale: 'ko', invited_by_account_id: inviter.account_id)
      expect(record.sign_up_ip.to_s).to eq '192.0.2.1'
      expect(record.current_sign_in_at).to be_within(1.second).of(user.current_sign_in_at)
      expect(record.confirmed?).to be true
      expect(record.ips.map { |ip| ip.ip.to_s }).to contain_exactly('192.0.2.1', '198.51.100.7', '203.0.113.9')
    end

    it 'also archives when the posts are kept under an anonymous name' do
      subject.call(account, reserve_username: true, reserve_email: false, preserve_content: true)

      expect(DeletedUserRecord.find_by(account_id: account.id)&.email).to eq 'leaver+4@example.com'
    end

    it 'leaves the same email free to sign up again' do
      subject.call(account, reserve_username: true, reserve_email: false)

      expect(Fabricate.build(:user, email: 'leaver+4@example.com')).to be_valid
    end

    it 'keeps nothing when the account row is destroyed as well' do
      subject.call(account, reserve_username: false, reserve_email: false)

      expect(DeletedUserRecord.count).to eq 0
    end

    it 'keeps the user when archiving fails', :aggregate_failures do
      allow(DeletedUserRecord).to receive(:capture!).and_raise(ActiveRecord::RecordInvalid)

      expect { subject.call(account, reserve_username: true, reserve_email: false) }.to raise_error(ActiveRecord::RecordInvalid)
      expect(User.find_by(id: user.id)).to_not be_nil
    end
  end
end
