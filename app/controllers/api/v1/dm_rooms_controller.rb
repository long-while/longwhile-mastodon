# frozen_string_literal: true

# @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
#   방 목록·단건·생성·읽음 기록·나가기.
#   근거: dm-chat-phase-1.md §4
#
#   메시지 전송은 여기 없다. 기존 POST /api/v1/statuses 를 그대로 쓴다 — 그래야
#   공식 앱과 서드파티에서 우리 메시지가 정상으로 보인다. (기획서 §7.5)
class Api::V1::DmRoomsController < Api::BaseController
  include Api::DmRoomAccess

  LIMIT = 20

  # 한 방의 참여자 상한. 없으면 요청 하나로 인스턴스 전원에게 dm_room_members 행을
  # 만들 수 있고, 그 조합을 바꿔가며 무한히 반복할 수 있다. 그룹 DM 이 열리는
  # Phase 5 를 감안해도 이 수치면 넉넉하다.
  MAX_PARTICIPANTS = 20

  # 한 요청에서 되살릴 방의 최대 수. 목록을 여는 비용이 무한정 늘어나지 않게 한다.
  REPAIR_LIMIT = 10

  before_action -> { doorkeeper_authorize! :read, :'read:statuses' }, only: [:index, :show]
  before_action -> { doorkeeper_authorize! :write, :'write:conversations' }, only: [:create, :destroy, :read, :title]
  before_action :require_user!
  before_action :set_room, only: [:show, :destroy, :read, :title]

  after_action :insert_pagination_headers, only: :index

  def index
    repair_orphaned_rooms!
    @rooms = paginated_rooms
    hidden_ids = hidden_last_status_ids(@rooms)

    render json: rooms_with_visible_messages(@rooms),
           each_serializer: REST::DmRoomSerializer,
           current_account: current_account,
           hidden_status_ids: hidden_ids,
           unread_counts: DmRoom.unread_counts_for(@rooms, current_account),
           relationships: StatusRelationshipsPresenter.new(@rooms.filter_map(&:last_status), current_account.id)
  end

  # 루트가 지워졌거나 다른 방의 스레드를 가리키면 여기서 고친다. 클라이언트는 이
  # 응답의 root_status_id 에 답글을 달아 보내므로, 틀린 값을 그대로 주면 다음
  # 메시지가 또 엉뚱한 곳으로 간다. (DmRoom#heal_thread!)
  def show
    @room.heal_thread!

    render_room(@room)
  end

  # account_ids 로 방을 찾거나 만든다. 프로필의 "메시지 보내기" 가 이 경로로 들어와야
  # "상대당 방 하나" 가 지켜진다.
  def create
    account_ids = requested_account_ids

    raise Mastodon::ValidationError, I18n.t('dm_rooms.errors.no_recipients') if account_ids.empty?
    raise Mastodon::ValidationError, I18n.t('dm_rooms.errors.too_many_recipients', max: MAX_PARTICIPANTS - 1) if account_ids.size >= MAX_PARTICIPANTS

    # 없는 계정으로 방을 만들면 열 수 없는 방이 남는다.
    raise Mastodon::ValidationError, I18n.t('dm_rooms.errors.unknown_recipients') if Account.where(id: account_ids).count != account_ids.size

    # 방장을 남긴다. 이미 있는 방을 찾은 경우에는 덮지 않는다 — 방장은 방이
    # 생긴 순간에 정해진다.
    @room = DmRoom.find_or_create_for(account_ids + [current_account.id], creator: current_account)

    render_room(@room)
  end

  # 읽음 커서를 앞으로 민다. 커서는 뒤로 가지 않는다 — 오래된 메시지를 열었다고
  # 읽음이 되돌아가면 그 뒤에 온 메시지가 다시 읽지 않음이 되어 배지가 되살아난다.
  def read
    # status_id 를 검증 없이 받으면 두 가지가 깨진다. 없는 id 는 외래키 위반으로
    # 500 이 되고, 다른 방의 id 는 커서를 그 방보다 앞으로 밀어 이 방의 배지가
    # 영원히 0 이 된다(커서는 뒤로 가지 않는다). 이 방에서 내가 볼 수 있는
    # 메시지인지 확인한다.
    target_id = params[:status_id].presence
    raise Mastodon::ValidationError, I18n.t('dm_rooms.errors.unknown_status') if target_id.present? && !readable_status?(target_id)

    cursor   = DmRoomRead.create_or_find_by!(dm_room_id: @room.id, account_id: current_account.id)
    advanced = cursor.advance_to!(target_id || @room.last_status_id)

    # 하위 호환. 공식 앱이 기존 화면에서 이 방을 열면 unread 가 꺼져 있어야 한다.
    # (ADR-005, dm-chat-phase-1.md §4.5)
    mark_legacy_conversations_read!

    # 읽음 이벤트 (FR-18, Phase 4). **커서가 실제로 전진했을 때만** 발행한다 —
    # 무조건 부르면 방을 열어 둔 채 스크롤할 때마다 같은 값이 계속 나간다.
    # 상호주의 판정과 대상 한정은 모델이 한다. (docs/dm-chat/phases/dm-chat-phase-4.md §2.4)
    @room.broadcast_read!(current_account) if advanced

    render_room(@room.reload)
  end

  # 방 제목을 바꾼다. 빈 값이면 제목 삭제다. (Phase 5, docs/dm-chat/phases/dm-chat-phase-5.md §3.1)
  #
  # 멤버 확인은 set_room 이 이미 했다 — 비멤버는 404 다. 제목은 방 전체가 함께
  # 보는 값이므로 누가 바꿨는지가 남아야 하고, 그래서 시스템 메시지가 따라간다.
  def title
    new_title = params[:title].to_s.strip

    raise Mastodon::ValidationError, I18n.t('dm_rooms.errors.title_too_long', max: DmRoom::TITLE_MAX_LENGTH) if new_title.length > DmRoom::TITLE_MAX_LENGTH

    @room.change_title!(current_account, new_title)

    render_room(@room.reload)
  end

  # 대화 나가기 (FR-27). 목록에서만 사라지고 방·메시지·읽음 커서는 그대로 남는다.
  # 새 메시지가 오면 DmRoom#unhide_for_everyone! 이 되돌린다.
  # 근거: dm-chat-decisions.md D-05
  def destroy
    @membership.hide!

    # 기존 /conversations 화면과 숨김 상태를 맞춘다. 상류의 대화 삭제와 같은 의미론이다.
    legacy_conversations.destroy_all

    render_empty
  end

  private

  def render_room(room)
    render json: room,
           serializer: REST::DmRoomSerializer,
           current_account: current_account,
           hidden_status_ids: hidden_last_status_ids([room])
  end

  # "나에게서만 삭제" 한 글이 목록 미리보기에 남지 않게 하려고 미리 조회한다.
  # (B-06, 마이그레이션 20260812000000)
  #
  # `dm_rooms.last_status_id` 는 방 전체가 공유하는 값이라 사람마다 다를 수 없다.
  # 그래서 숨김은 직렬화 시점에 판정하는데, 방마다 exists? 를 부르면 목록 한 번에
  # 20 번 왕복한다. **한 쿼리로 미리 걷어서** 직렬화기에 넘긴다.
  #
  # 대개 빈 배열이다 — 마지막 메시지를 지운 방에서만 값이 있다.
  def hidden_last_status_ids(rooms)
    ids = rooms.filter_map(&:last_status_id)

    return [] if ids.empty?

    DmHiddenStatus.where(account_id: current_account.id, status_id: ids).pluck(:status_id) + excluded_last_status_ids(rooms)
  end

  # 차단·뮤트 관계인 사람이 쓴 미리보기. 숨긴 글과 같이 다루면 직렬화기가 그 다음
  # 볼 수 있는 글로 물러선다(visible_statuses_for 가 그 사람의 글을 뺀다).
  def excluded_last_status_ids(rooms)
    excluded = current_account.excluded_from_timeline_account_ids

    rooms.filter_map(&:last_status).select { |status| excluded.include?(status.account_id) }.map(&:id)
  end

  # 차단·뮤트한 사람의 메시지밖에 없는 방은 목록에 올리지 않는다. 그 사람이 방을 새로
  # 만들어 말을 거는 것만으로 내 목록에 나타나면 차단이 무의미하다. 페이지 커서는
  # 거르기 전의 @rooms 로 잡는다 — 걸러진 방 때문에 뒤 페이지를 잃으면 안 된다.
  def rooms_with_visible_messages(rooms)
    excluded_ids = excluded_last_status_ids(rooms)
    return rooms if excluded_ids.empty?

    rooms.reject do |room|
      excluded_ids.include?(room.last_status_id) && !room.visible_statuses_for(current_account).exists?
    end
  end

  def set_room
    set_dm_room_membership!(params[:id])
  end

  # 방의 last_status 는 언제나 받는다. 클라이언트는 방을 열 때 그 id 를 보내는데,
  # 그 글이 이 방의 conversation 밖에 있으면(DmRoom.thread_accepts?) 아래 검사에
  # 걸려 방을 열 때마다 422 가 났다. 이 방의 머리이므로 커서를 거기까지 밀어도
  # 다른 방의 배지에는 영향이 없다.
  def readable_status?(status_id)
    status_id.to_i == @room.last_status_id || @room.visible_statuses_for(current_account).exists?(id: status_id)
  end

  def requested_account_ids
    ids = params[:account_ids]

    # account_ids[foo]=1 처럼 해시로 오면 map(&:to_i) 가 터져 500 이 된다.
    raise Mastodon::ValidationError, I18n.t('dm_rooms.errors.no_recipients') unless ids.nil? || ids.is_a?(Array) || ids.is_a?(String)

    Array(ids).map(&:to_i).uniq - [current_account.id, 0]
  end

  def paginated_rooms
    DmRoom
      .visible_to(current_account)
      .includes(:dm_room_reads, :dm_room_nicknames, members: [:account_stat, { user: :role }], last_status: Status::CACHEABLE_ASSOCIATIONS)
      .to_a_paginated_by_last_status_id(limit_param(LIMIT), params_slice(:max_id, :since_id, :min_id))
  end

  def legacy_conversations
    AccountConversation.where(account_id: current_account.id, conversation_id: @room.conversations.select(:id))
  end

  def mark_legacy_conversations_read!
    legacy_conversations.update_all(unread: false)
  end

  # last_status_id 가 null 로 남은 방을 되살린다.
  #
  # 그렇게 되는 경로가 둘 있다. delete_all 로 글을 지우는 배치(BatchedRemoveStatusService,
  # Vacuum::StatusesVacuum)는 콜백이 돌지 않아 외래키만 컬럼을 null 로 만들고,
  # 기능 플래그를 껐다 켠 사이에 지워진 글도 마찬가지다.
  #
  # 목록 쿼리가 last_status_id IS NULL 인 방을 빼기 때문에, 페이지에 담긴 방만
  # 고쳐서는 절대 고쳐지지 않는다(그 방은 페이지에 들어오지 못한다). 그래서 페이지를
  # 만들기 **전에**, 내 방 중 null 인 것만 따로 찾아 고친다. 그 수는 많아야 몇 개다.
  def repair_orphaned_rooms!
    # where.missing 은 LEFT JOIN 이 비는 경우를 잡는다. last_status_id 가 null 인
    # 경우와, 값은 있는데 그 글이 지워졌거나 버려진 경우를 한 번에 덮는다
    # (belongs_to 조인이 Status 의 kept 스코프를 탄다).
    DmRoom.visible_to(current_account)
          .where.missing(:last_status)
          .limit(REPAIR_LIMIT)
          .each(&:rewind_last_status!)
  end

  def next_path
    api_v1_dm_rooms_url pagination_params(max_id: @rooms.last.last_status_id) if records_continue?
  end

  def prev_path
    api_v1_dm_rooms_url pagination_params(min_id: @rooms.first.last_status_id) unless @rooms.empty?
  end

  def records_continue?
    @rooms.size == limit_param(LIMIT)
  end
end
