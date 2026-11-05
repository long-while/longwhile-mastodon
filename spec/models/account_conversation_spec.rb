# frozen_string_literal: true

require 'rails_helper'

RSpec.describe AccountConversation do
  let!(:alice) { Fabricate(:account, username: 'alice') }
  let!(:bob)   { Fabricate(:account, username: 'bob') }
  let!(:mark)  { Fabricate(:account, username: 'mark') }

  describe '.add_status' do
    it 'creates new record when no others exist' do
      status = Fabricate(:status, account: alice, visibility: :direct)
      status.mentions.create(account: bob)

      conversation = described_class.add_status(alice, status)

      expect(conversation.participant_accounts).to include(bob)
      expect(conversation.last_status).to eq status
      expect(conversation.status_ids).to eq [status.id]
    end

    it 'appends to old record when there is a match' do
      last_status  = Fabricate(:status, account: alice, visibility: :direct)
      conversation = described_class.create!(account: alice, conversation_id: last_status.conversation_id, participant_account_ids: [bob.id], status_ids: [last_status.id])

      status = Fabricate(:status, account: bob, visibility: :direct, thread: last_status)
      status.mentions.create(account: alice)

      new_conversation = described_class.add_status(alice, status)

      expect(new_conversation.id).to eq conversation.id
      expect(new_conversation.participant_accounts).to include(bob)
      expect(new_conversation.last_status).to eq status
      expect(new_conversation.status_ids).to eq [last_status.id, status.id]
    end

    it 'creates new record when new participants are added' do
      last_status  = Fabricate(:status, account: alice, visibility: :direct)
      conversation = described_class.create!(account: alice, conversation_id: last_status.conversation_id, participant_account_ids: [bob.id], status_ids: [last_status.id])

      status = Fabricate(:status, account: bob, visibility: :direct, thread: last_status)
      status.mentions.create(account: alice)
      status.mentions.create(account: mark)

      new_conversation = described_class.add_status(alice, status)

      expect(new_conversation.id).to_not eq conversation.id
      expect(new_conversation.participant_accounts).to include(bob, mark)
      expect(new_conversation.last_status).to eq status
      expect(new_conversation.status_ids).to eq [status.id]
    end
  end

  describe '.remove_status' do
    it 'updates last status to a previous value' do
      last_status  = Fabricate(:status, account: alice, visibility: :direct)
      status       = Fabricate(:status, account: alice, visibility: :direct)
      conversation = described_class.create!(account: alice, conversation_id: last_status.conversation_id, participant_account_ids: [bob.id], status_ids: [status.id, last_status.id])
      last_status.mentions.create(account: bob)
      last_status.destroy!
      conversation.reload
      expect(conversation.last_status).to eq status
      expect(conversation.status_ids).to eq [status.id]
    end

    it 'removes the record if no other statuses are referenced' do
      last_status  = Fabricate(:status, account: alice, visibility: :direct)
      conversation = described_class.create!(account: alice, conversation_id: last_status.conversation_id, participant_account_ids: [bob.id], status_ids: [last_status.id])
      last_status.mentions.create(account: bob)
      last_status.destroy!
      expect(described_class.where(id: conversation.id).count).to eq 0
    end

    # @_longwhile — STATUS_IDS_LIMIT 도입에 따른 보정 (dm-chat-phase-0.md §2.2)
    it 'keeps the record when older statuses remain outside the capped array' do
      stub_const("#{described_class}::STATUS_IDS_LIMIT", 2)

      root   = direct_status_from(alice, to: bob)
      recent = Array.new(2) { direct_status_from(alice, to: bob, thread: root) }

      conversation = described_class.create!(account: alice, conversation: root.conversation, participant_account_ids: [bob.id], status_ids: ([root.id] + recent.map(&:id)))

      # 상한 때문에 root 는 배열에서 밀려나 있지만 대화에는 여전히 남아 있다.
      expect(conversation.status_ids).to eq recent.map(&:id).sort

      recent.each { |status| discard_and_destroy(status) }

      expect(described_class.where(id: conversation.id).count).to eq 1
      expect(conversation.reload.status_ids).to eq [root.id]
      expect(conversation.last_status_id).to eq root.id
    end

    it 'still deletes the record when the conversation is really empty' do
      stub_const("#{described_class}::STATUS_IDS_LIMIT", 2)

      status       = direct_status_from(alice, to: bob)
      conversation = described_class.create!(account: alice, conversation: status.conversation, participant_account_ids: [bob.id], status_ids: [status.id])

      discard_and_destroy(status)

      expect(described_class.where(id: conversation.id).count).to eq 0
    end

    # 되채움은 하드 삭제(discard 없이 destroy)에서도 돌아야 한다. 계정 정리로 상대의
    # 메시지가 통째로 지워질 때, 내 메시지가 남아 있으면 대화는 살아 있어야 한다.
    it 'refills on hard deletion paths too' do
      stub_const("#{described_class}::STATUS_IDS_LIMIT", 1)

      mine   = direct_status_from(alice, to: bob)
      theirs = direct_status_from(bob, to: alice, thread: mine)

      conversation = described_class.create!(account: alice, conversation: mine.conversation, participant_account_ids: [bob.id], status_ids: [theirs.id])

      theirs.destroy!

      expect(described_class.where(id: conversation.id).count).to eq 1
      expect(conversation.reload.status_ids).to eq [mine.id]
    end

    # 되채움이 상한을 지키는지. 창 밖에 여러 건이 남아 있어도 N건만 담아야 한다.
    it 'caps the refilled array at the limit' do
      stub_const("#{described_class}::STATUS_IDS_LIMIT", 2)

      root   = direct_status_from(alice, to: bob)
      older  = Array.new(3) { direct_status_from(alice, to: bob, thread: root) }
      recent = direct_status_from(alice, to: bob, thread: root)

      conversation = described_class.create!(account: alice, conversation: root.conversation, participant_account_ids: [bob.id], status_ids: [recent.id])

      discard_and_destroy(recent)

      surviving = ([root] + older).map(&:id).sort

      expect(conversation.reload.status_ids.size).to eq 2
      expect(conversation.status_ids).to eq surviving.last(2)
    end

    # 참여자 조합이 다른 형제 행의 메시지를 끌어오면 안 된다.
    it 'does not refill from a sibling conversation with different participants' do
      stub_const("#{described_class}::STATUS_IDS_LIMIT", 1)

      root = Fabricate(:status, account: alice, visibility: :direct)
      root.mentions.create(account: bob)
      root.mentions.create(account: mark)

      solo = direct_status_from(alice, to: bob, thread: root)

      conversation = described_class.create!(account: alice, conversation: root.conversation, participant_account_ids: [bob.id], status_ids: [solo.id])

      discard_and_destroy(solo)

      # root 는 참여자가 [bob, mark] 라 이 행의 것이 아니다.
      expect(described_class.where(id: conversation.id).count).to eq 0
    end
  end

  # @_longwhile custom — dm-chat-phase-0.md P0-2
  describe 'STATUS_IDS_LIMIT' do
    it 'keeps only the most recent ids and still points last_status at the newest' do
      stub_const("#{described_class}::STATUS_IDS_LIMIT", 3)

      statuses = Array.new(5) { direct_status_from(alice, to: bob) }

      conversation = described_class.create!(account: alice, conversation: statuses.first.conversation, participant_account_ids: [bob.id], status_ids: statuses.map(&:id))

      expect(conversation.status_ids).to eq statuses.map(&:id).sort.last(3)
      expect(conversation.last_status_id).to eq statuses.map(&:id).max
    end

    # 상한이 걸린 뒤에도 add_status 의 append 경로가 배열을 넘치지 않게 유지하는지.
    # 위 예제들과 달리 실제 쓰기 경로를 지난다.
    it 'keeps the array capped when statuses arrive through add_status' do
      stub_const("#{described_class}::STATUS_IDS_LIMIT", 3)

      root     = direct_status_from(alice, to: bob)
      statuses = [root] + Array.new(4) { direct_status_from(alice, to: bob, thread: root) }

      statuses.each { |status| described_class.add_status(alice, status) }

      conversation = described_class.find_by(account: alice, conversation_id: root.conversation_id, participant_account_ids: [bob.id])

      expect(conversation.status_ids).to eq statuses.map(&:id).sort.last(3)
      expect(conversation.last_status_id).to eq statuses.map(&:id).max
    end

    it 'does not add the same status twice through add_status' do
      status = direct_status_from(alice, to: bob)

      2.times { described_class.add_status(alice, status) }

      conversation = described_class.find_by(account: alice, conversation_id: status.conversation_id, participant_account_ids: [bob.id])

      expect(conversation.status_ids).to eq [status.id]
    end

    it 'keeps every id when the limit is disabled' do
      stub_const("#{described_class}::STATUS_IDS_LIMIT", 0)

      statuses = Array.new(5) { direct_status_from(alice, to: bob) }

      conversation = described_class.create!(account: alice, conversation: statuses.first.conversation, participant_account_ids: [bob.id], status_ids: statuses.map(&:id))

      expect(conversation.status_ids).to eq statuses.map(&:id).sort
    end
  end

  def direct_status_from(author, to:, thread: nil)
    status = Fabricate(:status, account: author, visibility: :direct, thread: thread)
    status.mentions.create(account: to)
    status
  end

  # RemoveStatusService 와 같은 순서. discard 가 먼저라야 되채움이 동작한다.
  def discard_and_destroy(status)
    status.discard_with_reblogs
    status.destroy!
  end
end
