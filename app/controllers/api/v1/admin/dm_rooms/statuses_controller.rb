# frozen_string_literal: true

# @_longwhile custom feature
class Api::V1::Admin::DmRooms::StatusesController < Api::BaseController
  include Api::DmRoomAccess
  include Authorization

  LIMIT     = 30
  MAX_LIMIT = 40

  before_action -> { doorkeeper_authorize! :read, :'read:statuses' }
  before_action :require_user!
  before_action :require_dm_admin!
  before_action :set_room

  after_action :insert_pagination_headers

  def index
    @statuses = paginated_statuses

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
