# frozen_string_literal: true

# @_longwhile custom feature
class Api::V1::DmRooms::StatusesController < Api::BaseController
  include Api::DmRoomAccess

  LIMIT     = 30
  MAX_LIMIT = 40

  ORPHAN_SCAN_LIMIT = 200

  before_action -> { doorkeeper_authorize! :read, :'read:statuses' }
  before_action :require_user!
  before_action :set_room

  after_action :insert_pagination_headers

  def index
    attach_orphan_conversations!

    @statuses = paginated_statuses

    render json: @statuses,
           each_serializer: REST::StatusSerializer,
           relationships: StatusRelationshipsPresenter.new(@statuses, current_account.id)
  end

  private

  def set_room
    set_dm_room_membership!(params[:dm_room_id])
  end

  def paginated_statuses
    ids = @room.visible_statuses_for(current_account)
               .to_a_paginated_by_id(limit_param(LIMIT, MAX_LIMIT), params_slice(:max_id, :since_id, :min_id))
               .map(&:id)

    @has_more    = ids.size == limit_param(LIMIT, MAX_LIMIT)
    @oldest_id   = ids.last
    @newest_id   = ids.first

    Status.permitted_statuses_from_ids(ids, current_account, stable: true)
  end

  def attach_orphan_conversations!
    return if params[:max_id].present?

    member_ids = @room.dm_room_members.pluck(:account_id).sort

    orphan_statuses(member_ids).each do |status|
      next unless DmRoom.participants_for(status) == member_ids

      DmRoom.attach_status!(status, resurrect: false)
    end
  end

  def orphan_statuses(member_ids)
    Status.direct_visibility
          .where(account_id: member_ids)
          .where(conversation_id: Conversation.where(dm_room_id: nil).where(id: candidate_conversation_ids).select(:id))
          .includes(:active_mentions)
          .reorder(id: :desc)
          .limit(ORPHAN_SCAN_LIMIT)
          .to_a
  end

  def candidate_conversation_ids
    Status.direct_visibility
          .where(account_id: @room.dm_room_members.select(:account_id))
          .reorder(id: :desc)
          .limit(ORPHAN_SCAN_LIMIT)
          .select(:conversation_id)
  end

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
