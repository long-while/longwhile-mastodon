# frozen_string_literal: true

require 'rails_helper'

RSpec.describe RepairDmRoomThreadsService do
  subject { described_class.new }

  let!(:alice) { Fabricate(:account, username: 'alice') }
  let!(:bob)   { Fabricate(:account, username: 'bob') }
  let!(:carol) { Fabricate(:account, username: 'carol') }

  let!(:group_root) { direct_status(alice, to: [bob, carol]) }
  let!(:group_room) { DmRoom.attach_status!(group_root) }
  let!(:pair_room)  { DmRoom.find_or_create_for([alice.id, bob.id]) }

  before { allow(Mastodon::DmChat).to receive(:enabled?).and_return(true) }

  def misplace!(status)
    pair_room.update_columns(last_status_id: status.id, root_status_id: status.id)
    status
  end

  it 'changes nothing without apply' do
    stray = misplace!(direct_status(alice, to: [bob], thread: group_root))

    result = subject.call

    expect(result.moves.map { |move| move.statuses.map(&:id) }).to eq [[stray.id]]
    expect(stray.reload.conversation_id).to eq group_root.conversation_id
    expect(pair_room.reload.root_status_id).to eq stray.id
  end

  it 'moves the stray messages into their own room and fixes its thread' do
    first  = direct_status(alice, to: [bob], thread: group_root)
    second = misplace!(direct_status(bob, to: [alice], thread: first))

    subject.call(apply: true)

    expect(first.reload.conversation_id).to eq second.reload.conversation_id
    expect(first.conversation_id).to_not eq group_root.conversation_id
    expect(pair_room.reload.visible_statuses_for(bob).pluck(:id)).to contain_exactly(first.id, second.id)
    expect(pair_room.root_status_id).to eq first.id
    expect(pair_room).to be_thread_intact
    expect(group_room.reload.last_status_id).to eq group_root.id
  end

  describe 'history of a room whose members changed' do
    let!(:old_pair) { direct_status(alice, to: [bob]) }

    before { group_room.attach_conversation!(old_pair.conversation_id) }

    it 'keeps messages from before the member change in the same conversation' do
      member_event(alice, to: [bob, carol], thread: old_pair)
      original = old_pair.conversation_id

      result = subject.call(apply: true)

      expect(result.moves).to be_empty
      expect(result.skips.map(&:reason)).to eq [:room_history]
      expect(old_pair.reload.conversation_id).to eq original
    end

    it 'keeps them when the member change sits in another conversation of the room' do
      event = member_event(alice, to: [bob, carol])
      group_room.attach_conversation!(event.conversation_id)

      expect(subject.call(apply: true).moves).to be_empty
    end

    it 'keeps them even when no member change was recorded' do
      direct_status(bob, to: [alice], thread: old_pair)

      expect(subject.call(apply: true).moves).to be_empty
    end

    it 'still moves a message sent with the old roster after the change' do
      event = member_event(alice, to: [bob, carol], thread: old_pair)
      stale = direct_status(alice, to: [bob], thread: event)

      result = subject.call(apply: true)

      expect(result.moves.flat_map { |move| move.statuses.map(&:id) }).to eq [stale.id]
    end
  end

  it 'leaves edited messages for a person to check' do
    stray = direct_status(alice, to: [bob], thread: group_root)
    stray.update_column(:edited_at, Time.now.utc)

    result = subject.call(apply: true)

    expect(result.moves).to be_empty
    expect(result.skips.map(&:reason)).to eq [:edited]
  end

  it 'is safe to run twice' do
    misplace!(direct_status(alice, to: [bob], thread: group_root))

    subject.call(apply: true)

    expect(subject.call(apply: true).moves).to be_empty
  end

  it 'leaves what the remaining members sent after a member was anonymised', :aggregate_failures do
    carol.update!(anonymized_at: Time.now.utc)
    reply = direct_status(bob, to: [alice], thread: group_root)
    DmRoom.attach_status!(reply)

    result = subject.call(apply: true)

    expect(result.moves).to be_empty
    expect(result.skips.flat_map(&:status_ids)).to_not include(reply.id)
    expect(reply.reload.conversation_id).to eq group_root.conversation_id
    expect(group_room.reload.last_status_id).to eq reply.id
  end

  def member_event(author, to:, thread: nil)
    status = direct_status(author, to: to, thread: thread)
    status.update_column(:spoiler_text, DmRoom::MEMBER_EVENT_PREFIX)
    status
  end

  def direct_status(author, to:, thread: nil)
    status = Fabricate(:status, account: author, visibility: :direct, thread: thread)
    to.each { |account| status.mentions.create(account: account) }
    status
  end
end
