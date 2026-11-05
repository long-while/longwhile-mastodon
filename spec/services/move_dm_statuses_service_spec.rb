# frozen_string_literal: true

require 'rails_helper'

RSpec.describe MoveDmStatusesService do
  subject { described_class.new }

  let!(:alice) { Fabricate(:account, username: 'alice') }
  let!(:bob)   { Fabricate(:account, username: 'bob') }
  let!(:room)  { DmRoom.find_or_create_for([alice.id, bob.id]) }

  it 'gives the statuses a new conversation attached to the room' do
    status = direct_status(alice, to: bob)
    before = status.conversation_id

    conversation = subject.call([status], room)

    expect(status.reload.conversation_id).to eq conversation.id
    expect(conversation.id).to_not eq before
    expect(conversation.dm_room_id).to eq room.id
  end

  it 'moves a legacy row whole when every status in it moves' do
    status = direct_status(alice, to: bob)
    AccountConversation.add_status(bob, status)

    conversation = subject.call([status], room)

    expect(AccountConversation.where(account_id: bob.id).pluck(:conversation_id)).to eq [conversation.id]
  end

  it 'splits a legacy row when only some of its statuses move' do
    stays = direct_status(alice, to: bob)
    moves = direct_status(alice, to: bob, thread: stays)
    AccountConversation.add_status(bob, stays)
    AccountConversation.add_status(bob, moves)

    conversation = subject.call([moves], room)

    rows = AccountConversation.where(account_id: bob.id).order(:id)
    expect(rows.map { |row| [row.conversation_id, row.status_ids] }).to eq [[stays.conversation_id, [stays.id]], [conversation.id, [moves.id]]]
  end

  it 'does nothing for an empty list' do
    expect(subject.call([], room)).to be_nil
  end

  def direct_status(author, to:, thread: nil)
    status = Fabricate(:status, account: author, visibility: :direct, thread: thread)
    status.mentions.create(account: to)
    status
  end
end
