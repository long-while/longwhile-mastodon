# frozen_string_literal: true

class MoveDmStatusesService < BaseService
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
