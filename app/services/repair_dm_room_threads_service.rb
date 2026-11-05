# frozen_string_literal: true

# @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
#   다른 방의 conversation 에 들어가 있는 메시지를 찾아 제 방으로 옮기고,
#   루트·최신 글이 틀어진 방을 되감는다. `dm:repair_misplaced` 가 부른다.
#
#   어떻게 그런 메시지가 생겼는지는 DmRoom.thread_accepts? 에 적었다. 그 수정
#   이전에 쌓인 것을 치우는 일회성 도구다.
#
#   방의 conversation 에 참여자가 다른 글이 있다고 전부 잘못 들어간 것은 아니다.
#   방은 같은 행에서 참여자 조합만 바꾸므로(DmRoom#add_members! · #remove_member!),
#   옛 명단의 메시지가 정상 이력으로 남아 있다. 그래서 둘 중 하나일 때만 옮긴다.
#
#     1. 방의 **마지막 멤버 변경 안내보다 뒤**에 왔다. 그 뒤로는 명단이 지금의
#        멤버와 같아야 한다. 안내는 방 전체에서 찾는다(DmRoom#last_member_event_id).
#     2. 같은 참여자의 답글 사슬을 거슬러 올라가면 **참여자가 다른 글에서 갈라져
#        나왔다.** 정상 이력의 사슬은 스레드의 처음에서 시작하거나, 멤버 변경
#        안내에서 시작한다. 안내가 지워졌거나 발행에 실패한 방에서도 1 없이 이것으로
#        가려낸다.
#
#   수정된 메시지는 옮기지 않는다. 편집으로 지운 멘션은 silent 로 남아 참여자가
#   달라 보이는데, 그것은 잘못 들어간 것이 아니다.
class RepairDmRoomThreadsService < BaseService
  Move = Struct.new(:conversation_id, :source_room, :target_room, :statuses, keyword_init: true)
  Skip = Struct.new(:conversation_id, :source_room, :status_ids, :reason, keyword_init: true)

  Result = Struct.new(:moves, :skips, :healed_room_ids, keyword_init: true)

  # @param [Boolean] apply 거짓이면 아무것도 바꾸지 않고 계획만 돌려준다
  # @return [Result]
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

    # 익명화된 멤버를 뺀 명단도 이 방의 것이다(DmRoom#accepted_participant_sets).
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

  # 같은 참여자의 답글을 거슬러 올라가, 그 사슬의 첫 글이 참여자가 다른 글에 단
  # 답글인가. 부모가 이 conversation 의 direct 글 목록에 없으면(스레드의 처음,
  # 지워진 글, 공개 글) 갈라져 나온 것으로 보지 않는다.
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

  # 옮길 것이 없어도 루트·최신 글이 다른 방의 스레드를 가리키는 방이 있다
  # (옮기지 않기로 한 메시지가 루트였거나, 메시지가 이미 지워진 경우). 되감으면
  # 루트가 비워지고 다음 메시지가 새 스레드를 연다.
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
