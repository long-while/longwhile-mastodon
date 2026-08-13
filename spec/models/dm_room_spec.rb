# frozen_string_literal: true

require 'rails_helper'

# @_longwhile custom feature
RSpec.describe DmRoom do
  let!(:alice) { Fabricate(:account, username: 'alice') }
  let!(:bob)   { Fabricate(:account, username: 'bob') }
  let!(:mark)  { Fabricate(:account, username: 'mark') }

  before { allow(Mastodon::DmChat).to receive(:enabled?).and_return(true) }

  describe '.participant_key_for' do
    it 'is stable regardless of the order the ids arrive in' do
      expect(described_class.participant_key_for([alice.id, bob.id])).to eq described_class.participant_key_for([bob.id, alice.id])
    end

    it 'ignores duplicates' do
      expect(described_class.participant_key_for([alice.id, bob.id, alice.id])).to eq described_class.participant_key_for([alice.id, bob.id])
    end

    it 'differs when the participant set differs' do
      expect(described_class.participant_key_for([alice.id, bob.id])).to_not eq described_class.participant_key_for([alice.id, bob.id, mark.id])
    end
  end

  describe '.find_or_create_for' do
    it 'creates one room with one member row per participant' do
      room = described_class.find_or_create_for([alice.id, bob.id])

      expect(room.member_count).to eq 2
      expect(room.members).to contain_exactly(alice, bob)
    end

    it 'returns the same room for the same participants in any order' do
      first  = described_class.find_or_create_for([alice.id, bob.id])
      second = described_class.find_or_create_for([bob.id, alice.id])

      expect(second.id).to eq first.id
      expect(described_class.count).to eq 1
    end

    it 'recovers from a real unique violation instead of raising' do
      winner = described_class.find_or_create_for([alice.id, bob.id])

      allow(described_class).to receive(:find_by).and_call_original
      allow(described_class).to receive(:find_by).with(participant_key: winner.participant_key).and_return(nil, winner)

      loser = described_class.find_or_create_for([bob.id, alice.id])

      expect(loser.id).to eq winner.id
      expect(described_class.count).to eq 1
    end
  end

  describe '.attach_status!' do
    it 'links the conversation and records the last status' do
      status = direct_status_from(alice, to: bob)

      room = described_class.attach_status!(status)

      expect(status.conversation.reload.dm_room_id).to eq room.id
      expect(room.last_status_id).to eq status.id
      expect(room.root_status_id).to eq status.id
    end

    it 'is idempotent' do
      status = direct_status_from(alice, to: bob)

      first  = described_class.attach_status!(status)
      second = described_class.attach_status!(status)

      expect(second.id).to eq first.id
      expect(described_class.count).to eq 1
    end

    it 'puts several conversations with the same participants into one room' do
      first  = direct_status_from(alice, to: bob)
      second = direct_status_from(bob, to: alice)

      described_class.attach_status!(first)
      described_class.attach_status!(second)

      expect(described_class.count).to eq 1
      expect(first.conversation.reload.dm_room_id).to eq second.conversation.reload.dm_room_id
    end

    it 'keeps a different participant set in a different room' do
      pair  = direct_status_from(alice, to: bob)
      group = Fabricate(:status, account: alice, visibility: :direct)
      group.mentions.create(account: bob)
      group.mentions.create(account: mark)

      described_class.attach_status!(pair)
      described_class.attach_status!(group)

      expect(described_class.count).to eq 2
    end

    it 'ignores non-direct statuses' do
      expect(described_class.attach_status!(Fabricate(:status, account: alice, visibility: :public))).to be_nil
      expect(described_class.count).to eq 0
    end
  end

  describe '#register_status!' do
    it 'never moves last_status_id backwards' do
      older  = direct_status_from(alice, to: bob)
      newer  = direct_status_from(alice, to: bob, thread: older)

      room = described_class.attach_status!(newer)
      room.register_status!(older)

      expect(room.reload.last_status_id).to eq newer.id
    end

    it 'advances the read cursor of the person who wrote the message' do
      status = direct_status_from(alice, to: bob)

      room = described_class.attach_status!(status)

      expect(room.dm_room_reads.find_by(account_id: alice.id).last_read_status_id).to eq status.id
      expect(room.dm_room_reads.find_by(account_id: bob.id)).to be_nil
    end

    it 'never moves the author cursor backwards' do
      older = direct_status_from(alice, to: bob)
      newer = direct_status_from(alice, to: bob, thread: older)

      room = described_class.attach_status!(newer)
      room.register_status!(older)

      expect(room.dm_room_reads.find_by(account_id: alice.id).last_read_status_id).to eq newer.id
    end

    it 'leaves the cursor alone when back-filling history' do
      status = direct_status_from(alice, to: bob)

      room = described_class.attach_status!(status, resurrect: false)

      expect(room.dm_room_reads.find_by(account_id: alice.id)).to be_nil
    end
  end

  describe '#refresh_root_status!' do
    it 'heals itself when the root is deleted' do
      root  = direct_status_from(alice, to: bob)
      reply = direct_status_from(alice, to: bob, thread: root)

      room = described_class.attach_status!(reply)
      expect(room.root_status_id).to eq root.id

      root.destroy!

      expect(room.reload.root_status_id).to eq reply.id
    end
  end

  describe '#rewind_last_status!' do
    it 'falls back to the previous message when the last one is deleted' do
      first = direct_status_from(alice, to: bob)
      last  = direct_status_from(alice, to: bob, thread: first)

      room = described_class.attach_status!(last)
      last.destroy!

      expect(room.reload.last_status_id).to eq first.id
    end

    it 'keeps a stale last_status rather than blanking the room' do
      status = direct_status_from(alice, to: bob)
      room   = described_class.attach_status!(status)

      allow(room).to receive(:latest_room_status_id).and_return(nil)

      room.rewind_last_status!

      expect(room.reload.last_status_id).to eq status.id
      expect(described_class.visible_to(alice)).to_not be_empty
    end
  end

  describe '#unread_count_for' do
    it 'counts only messages written by other people' do
      mine   = direct_status_from(alice, to: bob)
      theirs = direct_status_from(bob, to: alice, thread: mine)

      room = described_class.attach_status!(theirs)

      expect(room.unread_count_for(alice)).to eq 1
    end

    it 'counts nothing for the person who wrote the latest message' do
      mine   = direct_status_from(alice, to: bob)
      theirs = direct_status_from(bob, to: alice, thread: mine)

      room = described_class.attach_status!(theirs)

      expect(room.unread_count_for(bob)).to eq 0
    end

    it 'counts nothing past the read cursor' do
      mine   = direct_status_from(alice, to: bob)
      theirs = direct_status_from(bob, to: alice, thread: mine)

      room = described_class.attach_status!(theirs)
      room.dm_room_reads.create!(account: alice, last_read_status_id: theirs.id)

      expect(room.unread_count_for(alice)).to eq 0
    end
  end

  describe '#visible_statuses_for' do
    it 'excludes statuses that are not direct' do
      direct = direct_status_from(alice, to: bob)
      room   = described_class.attach_status!(direct)

      public_status = Fabricate(:status, account: alice, visibility: :public, thread: direct)

      expect(room.visible_statuses_for(alice).pluck(:id)).to eq [direct.id]
      expect(room.visible_statuses_for(alice).pluck(:id)).to_not include public_status.id
    end

    it 'excludes messages the account was not part of' do
      shared = Fabricate(:status, account: alice, visibility: :direct)
      shared.mentions.create(account: bob)
      shared.mentions.create(account: mark)

      room = described_class.attach_status!(shared)

      aside = Fabricate(:status, account: alice, visibility: :direct, thread: shared)
      aside.mentions.create(account: bob)

      expect(room.visible_statuses_for(mark).pluck(:id)).to eq [shared.id]
    end
  end

  describe '#unhide_for_everyone!' do
    it 'brings a hidden room back when a new message arrives' do
      first = direct_status_from(alice, to: bob)
      room  = described_class.attach_status!(first)

      room.dm_room_members.find_by(account_id: alice.id).hide!
      expect(described_class.visible_to(alice)).to be_empty

      described_class.attach_status!(direct_status_from(bob, to: alice, thread: first))

      expect(described_class.visible_to(alice)).to_not be_empty
    end

    it 'does not resurrect the room when an already known message is re-attached' do
      first = direct_status_from(alice, to: bob)
      room  = described_class.attach_status!(first)

      room.dm_room_members.find_by(account_id: alice.id).hide!

      described_class.attach_status!(first)

      expect(described_class.visible_to(alice)).to be_empty
    end
  end

  describe 'last_status containment' do
    it 'never adopts a non-direct reply that shares the conversation' do
      first  = direct_status_from(alice, to: bob)
      second = direct_status_from(alice, to: bob, thread: first)
      room   = described_class.attach_status!(second)

      followers_only = Fabricate(:status, account: alice, visibility: :private, thread: second)

      second.destroy!

      expect(room.reload.last_status_id).to eq first.id
      expect(room.last_status_id).to_not eq followers_only.id
    end

    it 'never adopts a direct message addressed to a different set of people' do
      first  = direct_status_from(alice, to: bob)
      second = direct_status_from(alice, to: bob, thread: first)
      room   = described_class.attach_status!(second)

      to_mark = direct_status_from(alice, to: mark, thread: second)

      second.destroy!

      expect(room.reload.last_status_id).to eq first.id
      expect(room.last_status_id).to_not eq to_mark.id
    end
  end

  describe 'cross-room isolation' do
    it 'does not leak a message from another room to a mentioned account' do
      room_one = described_class.attach_status!(direct_status_from(alice, to: bob))
      described_class.attach_status!(direct_status_from(alice, to: mark))

      expect(room_one.visible_statuses_for(mark)).to be_empty
    end
  end

  describe '#unread_count_for legacy reconciliation' do
    it 'reports zero when the legacy client already marked everything read' do
      status = direct_status_from(bob, to: alice)
      room   = described_class.attach_status!(status)

      AccountConversation.add_status(alice, status)
      expect(room.unread_count_for(alice)).to eq 1

      AccountConversation.where(account_id: alice.id).update_all(unread: false)

      expect(room.unread_count_for(alice)).to eq 0
    end
  end

  def direct_status_from(author, to:, thread: nil)
    status = Fabricate(:status, account: author, visibility: :direct, thread: thread)
    status.mentions.create(account: to)
    status
  end
end
