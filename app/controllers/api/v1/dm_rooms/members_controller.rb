# frozen_string_literal: true

# @_longwhile custom feature
class Api::V1::DmRooms::MembersController < Api::BaseController
  include Api::DmRoomAccess

  rescue_from DmRoom::DuplicateRoomError do
    render json: { error: I18n.t('dm_rooms.errors.room_exists') }, status: 422
  end

  before_action -> { doorkeeper_authorize! :write, :'write:conversations' }
  before_action :require_user!
  before_action :set_room
  before_action :set_target, only: [:destroy, :nickname]

  def create
    account_ids = requested_account_ids

    raise Mastodon::ValidationError, I18n.t('dm_rooms.errors.no_recipients') if account_ids.empty?

    raise Mastodon::ValidationError, I18n.t('dm_rooms.errors.unknown_recipients') if Account.where(id: account_ids).count != account_ids.size

    @room.add_members!(current_account, account_ids)

    render_room
  end

  def destroy
    raise Mastodon::NotPermittedError if @target.id == current_account.id
    raise Mastodon::NotPermittedError unless @room.created_by?(current_account)

    @room.remove_member!(current_account, @target)

    render_room
  end

  def nickname
    value = params[:nickname].to_s.strip

    raise Mastodon::ValidationError, I18n.t('dm_rooms.errors.nickname_too_long', max: DmRoomNickname::MAX_LENGTH) if value.length > DmRoomNickname::MAX_LENGTH

    raise ActiveRecord::RecordNotFound unless @room.dm_room_members.exists?(account_id: @target.id)

    @room.set_nickname!(current_account, @target, value)

    render_room
  end

  private

  def set_room
    set_dm_room_membership!(params[:dm_room_id])
  end

  def set_target
    @target = Account.find(params[:id])
  end

  def requested_account_ids
    ids = params[:account_ids]

    raise Mastodon::ValidationError, I18n.t('dm_rooms.errors.no_recipients') unless ids.nil? || ids.is_a?(Array) || ids.is_a?(String)

    Array(ids).map(&:to_i).uniq - [current_account.id, 0]
  end

  def render_room
    room = @room.reload

    render json: room,
           serializer: REST::DmRoomSerializer,
           current_account: current_account,
           hidden_status_ids: hidden_last_status_ids(room)
  end

  def hidden_last_status_ids(room)
    return [] if room.last_status_id.blank?

    DmHiddenStatus.where(account_id: current_account.id, status_id: room.last_status_id).pluck(:status_id)
  end
end
