# frozen_string_literal: true

# @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 운영 관리
#   운영진이 인스턴스의 모든 DM 방을 목록으로 보는 API. 화면은 /messages/all.
#
#   **권한은 기존 관리 페이지와 같은 것을 쓴다** — `Admin::DirectMessagePolicy`.
#   `/admin/direct_messages` 가 이미 그 정책으로 DM 본문을 보여주고 있으므로,
#   여기서 새로 정하지 않고 그대로 따른다. 둘이 갈라지면 한쪽에서 막힌 것이 다른
#   쪽에서 열리는 상태가 생긴다.
#
#   **doorkeeper 스코프는 일반 스코프를 쓴다(`admin:read` 가 아니다).** 웹 UI 의
#   토큰에는 admin 스코프가 없어서, 그것을 요구하면 운영진이 자기 화면에서
#   403 을 받는다. 실제 권한 판정은 아래 Pundit 이 한다.
class Api::V1::Admin::DmRoomsController < Api::BaseController
  include Api::DmRoomAccess
  include Authorization

  LIMIT = 20

  before_action -> { doorkeeper_authorize! :read, :'read:statuses' }
  before_action :require_user!
  before_action :require_dm_admin_client!
  before_action :require_dm_admin!
  before_action :set_room, only: :show

  after_action :insert_pagination_headers, only: :index

  def index
    @rooms = paginated_rooms

    render json: @rooms,
           each_serializer: REST::Admin::DmRoomSerializer,
           relationships: StatusRelationshipsPresenter.new(@rooms.filter_map(&:last_status), current_account.id)
  end

  def show
    render json: @room, serializer: REST::Admin::DmRoomSerializer
  end

  private

  def require_dm_admin!
    authorize [:admin, :direct_message], :index?
  end

  # `visible_to` 를 쓰지 않는다. 그것은 "내가 멤버이고 나가지 않은 방" 이라는 뜻이라
  # 운영진에게는 자기 대화만 보인다. 여기서는 전부다.
  #
  # 메시지가 하나도 없는 방(last_status_id 가 null)은 목록에 넣지 않는다. 열어도
  # 볼 것이 없고, 정렬 기준이 없어 페이지네이션에서 자리를 잡지 못한다.
  def paginated_rooms
    DmRoom.where.not(last_status_id: nil)
          .includes(members: [:account_stat, { user: :role }], last_status: [:media_attachments, :status_stat, { account: [:account_stat, { user: :role }], active_mentions: :account }])
          .to_a_paginated_by_last_status_id(limit_param(LIMIT), params_slice(:max_id, :since_id, :min_id))
  end

  # 멤버십을 보지 않는다. 일반 API 의 set_dm_room_membership! 은 멤버가 아니면
  # 404 인데, 운영진은 어느 방에도 멤버가 아니다.
  def set_room
    @room = DmRoom.find(params[:id])
  end

  def next_path
    api_v1_admin_dm_rooms_url pagination_params(max_id: @rooms.last.last_status_id) if records_continue?
  end

  def prev_path
    api_v1_admin_dm_rooms_url pagination_params(min_id: @rooms.first.last_status_id) unless @rooms.empty?
  end

  def records_continue?
    @rooms.size == limit_param(LIMIT)
  end
end
