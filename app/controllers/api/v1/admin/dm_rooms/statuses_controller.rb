# frozen_string_literal: true

# @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 운영 관리
#   방 하나의 메시지 목록. 운영진 전용.
#
#   일반 API(`Api::V1::DmRooms::StatusesController`)와 **가시성 규칙이 다르다.**
#   그쪽은 "내가 쓴 글이거나 나를 향한 멘션" 으로 좁힌 뒤 차단·뮤트 필터까지
#   거치는데, 여기서는 그 두 단계를 모두 쓰지 않는다.
#
#     좁히기   운영진은 참여자가 아니므로 그 조건에 걸리는 글이 하나도 없다.
#              그대로 쓰면 목록이 항상 비어 보인다.
#     필터     운영진이 차단·뮤트한 사람의 메시지가 빠지면, 그 사람이 보낸 것을
#              근거로 신고가 들어왔을 때 정작 그 글을 못 본다.
#
#   대신 **방에 속한 direct 글 전체**를 준다. 방 판정(`room_statuses`)이
#   참여자 조합을 이미 검증하므로 남의 대화가 섞이지 않는다.
#
#   메시지를 내주는 곳은 여기뿐이라 열람 기록도 여기서 남긴다
#   (Admin::DmRoomViewLog). 방 목록과 방 정보는 적지 않는다.
class Api::V1::Admin::DmRooms::StatusesController < Api::BaseController
  include Api::DmRoomAccess
  include Authorization
  include AccountableConcern

  LIMIT     = 30
  MAX_LIMIT = 40

  before_action -> { doorkeeper_authorize! :read, :'read:statuses' }
  before_action :require_user!
  before_action :require_dm_admin_client!
  before_action :require_dm_admin!
  before_action :set_room

  after_action :insert_pagination_headers

  def index
    @statuses = paginated_statuses
    log_room_view

    render json: @statuses,
           each_serializer: REST::StatusSerializer,
           relationships: StatusRelationshipsPresenter.new(@statuses, current_account.id)
  end

  private

  def require_dm_admin!
    authorize [:admin, :direct_message], :index?
  end

  def set_room
    @room = DmRoom.find(params[:dm_room_id])
  end

  def log_room_view
    return if Admin::DmRoomViewLog.recorded_recently?(current_account, @room)

    log_action Admin::DmRoomViewLog::ACTION, @room
  end

  def paginated_statuses
    @room.room_statuses
         .includes(:media_attachments, :status_stat, account: [:account_stat, { user: :role }])
         .to_a_paginated_by_id(limit_param(LIMIT, MAX_LIMIT), params_slice(:max_id, :since_id, :min_id))
  end

  def next_path
    api_v1_admin_dm_room_statuses_url @room.id, pagination_params(max_id: @statuses.last.id) if records_continue?
  end

  def prev_path
    api_v1_admin_dm_room_statuses_url @room.id, pagination_params(min_id: @statuses.first.id) unless @statuses.empty?
  end

  def records_continue?
    @statuses.size == limit_param(LIMIT, MAX_LIMIT)
  end
end
