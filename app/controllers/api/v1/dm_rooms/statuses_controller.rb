# frozen_string_literal: true

# @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
#   방의 메시지 목록. 이 Phase 에서 가장 조심해야 하는 곳이다.
#   근거: dm-chat-phase-1.md §4.4, 기획서 §11.1
class Api::V1::DmRooms::StatusesController < Api::BaseController
  include Api::DmRoomAccess

  LIMIT     = 30
  MAX_LIMIT = 40

  # 지연 귀속이 훑을 상한. 백필이 도는 동안 이 경로가 전체를 훑으면 안 된다.
  ORPHAN_SCAN_LIMIT = 200

  before_action -> { doorkeeper_authorize! :read, :'read:statuses' }, only: [:index]
  before_action -> { doorkeeper_authorize! :write, :'write:statuses' }, only: [:hide]
  before_action :require_user!
  before_action :set_room

  after_action :insert_pagination_headers, only: [:index]

  def index
    attach_orphan_conversations!

    @statuses = paginated_statuses

    render json: @statuses,
           each_serializer: REST::StatusSerializer,
           relationships: StatusRelationshipsPresenter.new(@statuses, current_account.id)
  end

  # "나에게서만 삭제". 글은 그대로 두고 **이 계정에게만** 안 보이게 한다.
  # (B-06, 마이그레이션 20260812000000, 기획서 §4.3.7)
  #
  # 남의 메시지에도 쓸 수 있다는 점이 `DELETE /api/v1/statuses/:id`(모두에게서
  # 삭제)와의 차이다. 그래서 소유권이 아니라 **이 방에서 내가 볼 수 있는 글인지**
  # 만 확인한다. 다른 방·다른 사람의 글 id 를 넣어도 여기서 404 로 막힌다.
  #
  # 운영진 화면(/messages/all)에는 영향이 없다. 그쪽은 `room_statuses` 를 쓰고
  # 이 필터를 타지 않는다 — 개인의 화면 정리가 감사 기록을 지우면 안 된다.
  def hide
    status_id = params[:id]

    # 이미 숨긴 글은 아래 조회에서 빠진다(visible_statuses_for 가 걸러낸다).
    # 그때 404 를 주면 두 번 누른 것이 실패로 보인다. 멱등하게 성공으로 답한다.
    return render_empty if DmHiddenStatus.exists?(account_id: current_account.id, status_id: status_id)

    # `not_found` 를 쓰지 않는다. 그쪽은 HTML 오류 페이지를 그리는 경로다.
    # Api::BaseController 가 이 예외를 404 JSON 으로 바꾼다 — 방 접근 검사
    # (Api::DmRoomAccess)도 같은 방식으로 막는다.
    status = @room.visible_statuses_for(current_account).find_by(id: status_id)

    raise ActiveRecord::RecordNotFound if status.nil?

    DmHiddenStatus.create!(account_id: current_account.id, status_id: status.id)

    render_empty
  rescue ActiveRecord::RecordNotUnique
    # 같은 사람이 두 탭에서 동시에 눌렀다. 유니크 인덱스가 막았고, 원하던 결과는
    # 이미 이루어졌다.
    render_empty
  end

  private

  def set_room
    set_dm_room_membership!(params[:dm_room_id])
  end

  # 가시성은 2단으로 건다.
  #
  #   1단  쿼리에서 직접 강제 — direct 이면서, 내가 썼거나 나를 향한 멘션이 있는 글
  #   2단  permitted_statuses_from_ids — 차단·뮤트·침묵·키워드 필터
  #
  # 2단만 쓰면 안 된다. StatusFilter 는 공개 범위를 보지 않으므로(#filtered? 는
  # 차단·뮤트·침묵만 검사한다), 1단을 생략하면 가시성 검증이 통째로 빠진다.
  def paginated_statuses
    # includes 를 걸지 않는다. 여기서 필요한 것은 id 뿐이고, 본문은 아래
    # permitted_statuses_from_ids 가 다시 가져온다. 프리로드해 봐야 통째로 버린다.
    ids = @room.visible_statuses_for(current_account)
               .to_a_paginated_by_id(limit_param(LIMIT, MAX_LIMIT), params_slice(:max_id, :since_id, :min_id))
               .map(&:id)

    # 페이지가 이어지는지는 **필터 전** 개수로 판단한다. 차단한 사용자의 메시지가
    # 한 건 섞였다고 뒤 페이지가 없다고 알리면, 클라이언트가 거기서 멈춰 나머지
    # 이력을 영영 못 본다.
    @has_more    = ids.size == limit_param(LIMIT, MAX_LIMIT)
    @oldest_id   = ids.last
    @newest_id   = ids.first

    # 직렬화기가 읽는 연관(미디어·멘션·카드·인용 등)은 거른 뒤에 한꺼번에 읽는다.
    # 안 그러면 메시지마다 예닐곱 쿼리가 나간다(타임라인의 preload_collection 과 같은 것).
    preload_collection(Status.permitted_statuses_from_ids(ids, current_account, stable: true), Status)
  end

  # 조회 시점 지연 귀속. 백필이 끝나기 전이거나, DM 알림이 필터링되어
  # push_to_conversation! 이 건너뛰어진 conversation 을 여기서 메꾼다. 멱등하므로
  # 이미 붙어 있으면 아무 일도 하지 않는다.
  # 근거: dm-chat-phase-1.md §3.3
  #
  # 첫 페이지를 열 때만 돈다. 과거 페이지를 넘길 때마다 훑을 이유가 없다.
  def attach_orphan_conversations!
    return if params[:max_id].present?

    member_ids = @room.dm_room_members.pluck(:account_id).sort

    orphan_statuses(member_ids).each do |status|
      next unless DmRoom.participants_for(status) == member_ids

      # resurrect: false — 여기서 붙는 것은 뒤늦게 발견한 과거 이력이지 새 메시지가
      # 아니다. 나간 사람의 방을 되살리면 안 된다. (FR-27)
      DmRoom.attach_status!(status, resurrect: false)
    end
  end

  # find_each 를 쓰지 않는다. in_batches 는 스코프의 정렬을 버리고 id 오름차순으로
  # 강제하므로, 상한을 걸면 **가장 오래된** 200건을 훑게 된다. 백필이 밀려 있을 때
  # 정작 필요한 최근 메시지는 영영 붙지 않고 같은 옛 행만 매번 다시 읽는다.
  def orphan_statuses(member_ids)
    Status.direct_visibility
          .where(account_id: member_ids)
          .where(conversation_id: Conversation.where(dm_room_id: nil).where(id: candidate_conversation_ids).select(:id))
          .includes(:active_mentions)
          .reorder(id: :desc)
          .limit(ORPHAN_SCAN_LIMIT)
          .to_a
  end

  # 후보를 이 방의 멤버가 쓴 글이 속한 conversation 으로 먼저 좁힌다. 그러지 않으면
  # conversations 전체를 훑는 상관 없는 서브쿼리가 방을 열 때마다 돈다.
  def candidate_conversation_ids
    Status.direct_visibility
          .where(account_id: @room.dm_room_members.select(:account_id))
          .reorder(id: :desc)
          .limit(ORPHAN_SCAN_LIMIT)
          .select(:conversation_id)
  end

  # 커서는 필터 전 id 로 잡는다. 페이지가 전부 걸러졌을 때 @statuses 는 비지만
  # 뒤에 이력이 남아 있으므로, 그 자리에서 끊으면 클라이언트가 더 못 넘어간다.
  def next_path
    api_v1_dm_room_statuses_url @room.id, pagination_params(max_id: @oldest_id) if records_continue?
  end

  def prev_path
    api_v1_dm_room_statuses_url @room.id, pagination_params(min_id: @newest_id) if @newest_id
  end

  def records_continue?
    @has_more
  end
end
