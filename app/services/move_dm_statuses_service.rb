# frozen_string_literal: true

# @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
#   다른 방의 conversation 에 들어가 있는 글을 **새 conversation** 으로 옮겨
#   제 방에 붙인다. DmRoom.attach_status! 의 안전망과 dm:repair_misplaced 가 쓴다.
#
#   바꾸는 것은 conversation_id 뿐이다. in_reply_to_id 는 그대로라 글 상세 화면의
#   스레드는 달라지지 않는다.
#
#   기존 /conversations 화면의 행(account_conversations)도 함께 옮긴다. 그 행은
#   (계정, conversation, 참여자) 로 묶이므로, 글만 옮기면 옛 conversation 쪽 행이
#   지워진 글 id 를 들고 남는다.
class MoveDmStatusesService < BaseService
  # @param [Array<Status>] statuses 한 conversation 안의, 참여자 조합이 같은 글들
  # @param [DmRoom] room 옮겨 갈 방
  # @return [Conversation, nil] 새 conversation
  def call(statuses, room)
    return if statuses.empty?

    @statuses               = statuses
    @source_conversation_id = statuses.first.conversation_id
    @participant_ids        = DmRoom.participants_for(statuses.first)

    ApplicationRecord.transaction do
      @conversation = Conversation.create!(dm_room_id: room.id)

      @statuses.each { |status| status.update_column(:conversation_id, @conversation.id) }
      move_legacy_conversations!
    end

    @conversation
  end

  private

  def move_legacy_conversations!
    moved_ids = @statuses.map(&:id)

    @participant_ids.each do |account_id|
      others = @participant_ids - [account_id]
      row    = AccountConversation.find_by(account_id: account_id, conversation_id: @source_conversation_id, participant_account_ids: others)

      next if row.nil?

      ids_here = row.status_ids & moved_ids

      next if ids_here.empty?

      split_legacy_row!(row, account_id, others, ids_here)
    end
  end

  def split_legacy_row!(row, account_id, others, ids_here)
    remaining = row.status_ids - ids_here

    return row.update!(conversation_id: @conversation.id) if remaining.empty?

    row.update!(status_ids: remaining)
    AccountConversation.create!(
      account_id: account_id,
      conversation_id: @conversation.id,
      participant_account_ids: others,
      status_ids: ids_here,
      unread: row.unread
    )
  end
end
