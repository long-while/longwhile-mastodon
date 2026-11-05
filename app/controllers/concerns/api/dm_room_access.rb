# frozen_string_literal: true

module Api::DmRoomAccess
  extend ActiveSupport::Concern

  included do
    before_action :require_dm_chat_feature!
  end

  private

  def require_dm_chat_feature!
    raise ActiveRecord::RecordNotFound unless Mastodon::DmChat.enabled?
  end

  def require_dm_admin_client!
    return if doorkeeper_token&.application&.superapp?
    return if doorkeeper_token&.acceptable?(%i(admin:read))

    raise Mastodon::NotPermittedError
  end

  def set_dm_room_membership!(room_id)
    @membership = DmRoomMember.find_by(dm_room_id: room_id, account_id: current_account.id)

    raise ActiveRecord::RecordNotFound if @membership.nil?

    @room = @membership.dm_room
  end
end
