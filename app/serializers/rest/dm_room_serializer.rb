# frozen_string_literal: true

# @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
#   근거: dm-chat-phase-1.md §4.2
class REST::DmRoomSerializer < ActiveModel::Serializer
  attributes :id, :unread_count, :root_status_id, :last_read_status_id,
             :is_group, :is_local, :title, :participant_read_states,
             :creator_id, :nicknames

  has_many :other_accounts, key: :accounts, serializer: REST::AccountSerializer
  has_one :last_status, serializer: REST::StatusSerializer

  def id
    object.id.to_s
  end

  # 답장 기준. 클라이언트가 추측하게 두지 않는다 — 방이 conversation 여럿을 묶으므로
  # 루트가 자명하지 않다. (dm-chat-decisions.md D-03)
  #
  # null 이면 메시지가 하나도 없는 방이며, 클라이언트는 in_reply_to 없이 새 스레드를
  # 시작한다.
  def root_status_id
    object.root_status_id&.to_s
  end

  def last_read_status_id
    read_cursor&.last_read_status_id&.to_s
  end

  # 목록은 컨트롤러가 DmRoom.unread_counts_for 로 한꺼번에 세어 넘긴다. 여기서
  # 방마다 세면 목록 한 번에 방 수만큼 count 가 나간다.
  def unread_count
    counts = instance_options[:unread_counts]
    return counts.fetch(object.id, 0) if counts

    object.unread_count_for(current_account)
  end

  def is_group # rubocop:disable Naming/PredicatePrefix
    object.group?
  end

  # 연합이 끊긴 운영에서는 항상 참이다. 그래도 내려보낸다 — 나중에 연합을 여는 서버가
  # 생겨도 API 계약이 바뀌지 않게 하기 위함이고 비용이 0 이다.
  # (dm-chat-decisions.md D-02)
  def is_local # rubocop:disable Naming/PredicatePrefix
    object.other_accounts(current_account).all?(&:local?)
  end

  def other_accounts
    object.other_accounts(current_account)
  end

  # 남들이 어디까지 읽었는가. (FR-16, docs/dm-chat/phases/dm-chat-phase-4.md §2.2)
  #
  # 상호주의로 막히면 **빈 배열**이고 필드는 남는다 — 필드가 사라지면 설정 상태가
  # 추론된다(기획서 §11.2). 판정과 조립은 전부 모델이 한다.
  #
  # 운영진 화면은 REST::Admin::DmRoomSerializer 라는 **별도 클래스**를 쓴다.
  # 이 필드를 공통 모듈로 빼면 그 화면에 전원의 읽음 상태가 실린다. 빼지 말 것.
  def participant_read_states
    object.participant_read_states_for(current_account)
  end

  # 목록 미리보기. **"나에게서만 삭제" 한 글이면 그 다음 것으로 물러선다.**
  # (B-06, 마이그레이션 20260812000000)
  #
  # `dm_rooms.last_status_id` 는 방 전체가 공유하는 값이라 사람마다 다를 수 없다.
  # 그대로 내리면 방에서는 지워진 메시지가 목록에서만 계속 보인다 — 지웠는데
  # 남아 있는 것처럼 보이는, 가장 나쁜 형태의 반쪽 동작이다.
  #
  # 판정 재료(hidden_status_ids)는 컨트롤러가 **한 쿼리로** 걷어서 넘긴다. 여기서
  # exists? 를 부르면 목록 한 번에 방 수만큼 왕복한다.
  #
  # 되감기 쿼리는 실제로 숨긴 방에서만 돈다. 그마저도 없으면(그 방의 메시지를
  # 전부 숨겼다) nil 이고, 미리보기가 빈 방으로 보인다 — 사실과 맞는 표시다.
  def last_status
    status = object.last_status

    return status if status.nil? || hidden_status_ids.exclude?(status.id)

    object.visible_statuses_for(current_account).reorder(id: :desc).first
  end

  # 방장. "그룹에서 삭제하기" 를 누구에게 보여줄지 클라이언트가 이것으로 정한다.
  # null 이면 이 컬럼이 생기기 전 방이고, 그런 방에서는 아무도 내보낼 수 없다.
  def creator_id
    object.creator_id&.to_s
  end

  # **내가 이 방에서 지정한** 별명들. `{ 대상 id => 별명 }`.
  #
  # 남이 지정한 것은 내려보내지 않는다. 별명은 지정한 사람의 화면을 정리하는
  # 수단이지 상대에게 하는 말이 아니다 — 새어나가면 그 뜻이 뒤집힌다.
  def nicknames
    object.nicknames_for(current_account)
  end

  private

  def hidden_status_ids
    instance_options[:hidden_status_ids] || []
  end

  def read_cursor
    return @read_cursor if defined?(@read_cursor)

    # find_by 대신 detect. 목록에서 dm_room_reads 를 프리로드해 두므로 방마다
    # 쿼리를 다시 내보내지 않는다.
    @read_cursor = object.dm_room_reads.detect { |cursor| cursor.account_id == current_account.id }
  end

  def current_account
    instance_options[:current_account]
  end
end
