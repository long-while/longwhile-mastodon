# frozen_string_literal: true

# @_longwhile custom feature
class Api::V1::DmRoomsController < Api::BaseController
  include Api::DmRoomAccess

  LIMIT = 20

  MAX_PARTICIPANTS = 20

  REPAIR_LIMIT = 10

  before_action -> { doorkeeper_authorize! :read, :'read:statuses' }, only: [:index, :show]
  before_action -> { doorkeeper_authorize! :write, :'write:conversations' }, only: [:create, :destroy, :read, :title]
  before_action :require_user!
  before_action :set_room, only: [:show, :destroy, :read, :title]

  after_action :insert_pagination_headers, only: :index

  def index
    repair_orphaned_rooms!
    @rooms = paginated_rooms

    render json: @rooms,
           each_serializer: REST::DmRoomSerializer,
           current_account: current_account,
           relationships: StatusRelationshipsPresenter.new(@rooms.filter_map(&:last_status), current_account.id)
  end

  def show
    render json: @room, serializer: REST::DmRoomSerializer, current_account: current_account
  end

  def create
    account_ids = requested_account_ids

    raise Mastodon::ValidationError, I18n.t('dm_rooms.errors.no_recipients') if account_ids.empty?
    raise Mastodon::ValidationError, I18n.t('dm_rooms.errors.too_many_recipients', max: MAX_PARTICIPANTS - 1) if account_ids.size >= MAX_PARTICIPANTS

    raise Mastodon::ValidationError, I18n.t('dm_rooms.errors.unknown_recipients') if Account.where(id: account_ids).count != account_ids.size

    @room = DmRoom.find_or_create_for(account_ids + [current_account.id])

    render json: @room, serializer: REST::DmRoomSerializer, current_account: current_account
  end

  def read
    target_id = params[:status_id].presence
    raise Mastodon::ValidationError, I18n.t('dm_rooms.errors.unknown_status') if target_id.present? && !@room.visible_statuses_for(current_account).exists?(id: target_id)

    cursor   = DmRoomRead.create_or_find_by!(dm_room_id: @room.id, account_id: current_account.id)
    advanced = cursor.advance_to!(target_id || @room.last_status_id)

    mark_legacy_conversations_read!

    @room.broadcast_read!(current_account) if advanced

    render json: @room.reload, serializer: REST::DmRoomSerializer, current_account: current_account
  end

  def title
    new_title = params[:title].to_s.strip

    raise Mastodon::ValidationError, I18n.t('dm_rooms.errors.title_too_long', max: DmRoom::TITLE_MAX_LENGTH) if new_title.length > DmRoom::TITLE_MAX_LENGTH

    @room.change_title!(current_account, new_title)

    render json: @room.reload, serializer: REST::DmRoomSerializer, current_account: current_account
  end

  def destroy
    @membership.hide!

    legacy_conversations.destroy_all

    render_empty
  end

  private

  def set_room
    set_dm_room_membership!(params[:id])
  end

  def requested_account_ids
    ids = params[:account_ids]

    raise Mastodon::ValidationError, I18n.t('dm_rooms.errors.no_recipients') unless ids.nil? || ids.is_a?(Array) || ids.is_a?(String)

    Array(ids).map(&:to_i).uniq - [current_account.id, 0]
  end

  def paginated_rooms
    DmRoom
      .visible_to(current_account)
      .includes(:dm_room_reads, members: [:account_stat, { user: :role }], last_status: [:media_attachments, :status_stat, { account: [:account_stat, { user: :role }], active_mentions: :account }])
      .to_a_paginated_by_last_status_id(limit_param(LIMIT), params_slice(:max_id, :since_id, :min_id))
  end

  def legacy_conversations
    AccountConversation.where(account_id: current_account.id, conversation_id: @room.conversations.select(:id))
  end

  def mark_legacy_conversations_read!
    legacy_conversations.update_all(unread: false)
  end

  def repair_orphaned_rooms!
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
