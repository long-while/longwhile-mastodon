# frozen_string_literal: true

class RepairDmRoomThreadsService < BaseService
  Move = Struct.new(:conversation_id, :source_room, :target_room, :statuses, keyword_init: true)
  Skip = Struct.new(:conversation_id, :source_room, :status_ids, :reason, keyword_init: true)

  Result = Struct.new(:moves, :skips, :healed_room_ids, keyword_init: true)

  def call(apply: false)
    @moves      = []
    @skips      = []
    @boundaries = {}
    @rosters    = {}

    attached_conversations.find_each { |conversation| plan_conversation(conversation) }

    @moves.each { |move| apply_move!(move) } if apply

    Result.new(moves: @moves, skips: @skips, healed_room_ids: heal_rooms!(apply))
  end

  private

  def attached_conversations
    Conversation.where.not(dm_room_id: nil)
                .where(id: Status.direct_visibility.select(:conversation_id))
                .includes(:dm_room)
  end

  def plan_conversation(conversation)
    room     = conversation.dm_room
    accepted = room.accepted_participant_sets
    statuses = Status.direct_visibility.where(conversation_id: conversation.id).includes(:active_mentions).reorder(id: :asc).to_a
    by_id    = statuses.index_by(&:id)

    strays = statuses.reject { |status| accepted.include?(roster(status)) }

    strays.group_by { |status| roster(status) }.each do |participant_ids, group|
      plan_group(conversation, room, participant_ids, group, by_id)
    end
  end

  def plan_group(conversation, room, participant_ids, group, by_id)
    misplaced, history = group.partition { |status| misplaced?(status, room, participant_ids, by_id) }
    edited, movable    = misplaced.partition { |status| status.edited_at.present? }

    add_skip(conversation, room, history, :room_history)
    add_skip(conversation, room, edited, :edited)

    return if movable.empty?

    target = participant_ids.size < 2 ? nil : DmRoom.find_by(participant_key: DmRoom.participant_key_for(participant_ids))

    return add_skip(conversation, room, movable, :no_room_for_participants) if target.nil?

    @moves << Move.new(conversation_id: conversation.id, source_room: room, target_room: target, statuses: movable)
  end

  def misplaced?(status, room, participant_ids, by_id)
    boundary = @boundaries.fetch(room.id) { @boundaries[room.id] = room.last_member_event_id }

    return true if boundary && status.id > boundary

    branched_off?(status, participant_ids, by_id)
  end

  def branched_off?(status, participant_ids, by_id)
    current = status

    loop do
      parent = by_id[current.in_reply_to_id]

      return false if parent.nil?
      return !member_event?(current) if roster(parent) != participant_ids

      current = parent
    end
  end

  def member_event?(status)
    status.spoiler_text.to_s.start_with?(DmRoom::MEMBER_EVENT_PREFIX)
  end

  def roster(status)
    @rosters[status.id] ||= DmRoom.normalize_ids(status.active_mentions.map(&:account_id) + [status.account_id])
  end

  def add_skip(conversation, room, statuses, reason)
    return if statuses.empty?

    @skips << Skip.new(conversation_id: conversation.id, source_room: room, status_ids: statuses.map(&:id), reason: reason)
  end

  def apply_move!(move)
    MoveDmStatusesService.new.call(move.statuses, move.target_room)

    move.target_room.reload.rewind_last_status!
    move.source_room.reload.rewind_last_status!
  end

  def heal_rooms!(apply)
    healed = []

    DmRoom.where.not(last_status_id: nil).includes(:last_status, :root_status).find_each do |room|
      next if room.thread_intact?

      room.heal_thread! if apply
      healed << room.id
    end

    healed
  end
end
