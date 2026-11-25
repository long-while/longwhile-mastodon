# frozen_string_literal: true

class Api::V1::Admin::DmRoomsController < Api::BaseController
  include Api::DmRoomAccess
  include Authorization
  include AccountableConcern

  LIMIT = 20

  before_action -> { doorkeeper_authorize! :read, :'read:statuses' }
  before_action :require_user!
  before_action :require_dm_admin_client!
  before_action :require_dm_admin!
  before_action :set_room, only: :show

  after_action :insert_pagination_headers, only: :index

  def index
    @rooms = paginated_rooms
    Admin::DirectMessageViewLog.log_list_view!(current_account)

    render json: @rooms, each_serializer: REST::Admin::DmRoomSerializer
  end

  def show
    log_room_view
    render json: @room, serializer: REST::Admin::DmRoomSerializer
  end

  private

  def require_dm_admin!
    authorize [:admin, :direct_message], :index?
  end

  def log_room_view
    return if Admin::DmRoomViewLog.recorded_recently?(current_account, @room)

    log_action Admin::DmRoomViewLog::ACTION, @room
  end

  def paginated_rooms
    DmRoom.where.not(last_status_id: nil)
      .includes(members: [:account_stat, { user: :role }], last_status: [{ account: [:account_stat, { user: :role }] }])
      .to_a_paginated_by_last_status_id(limit_param(LIMIT), params_slice(:max_id, :since_id, :min_id))
  end

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
