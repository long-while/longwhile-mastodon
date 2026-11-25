# frozen_string_literal: true

module Api::DmRoomLastStatusFilter
  extend ActiveSupport::Concern

  private

  def hidden_last_status_ids(rooms)
    ids = rooms.filter_map(&:last_status_id)

    return [] if ids.empty?

    DmHiddenStatus.where(account_id: current_account.id, status_id: ids).pluck(:status_id) + excluded_last_status_ids(rooms)
  end

  def excluded_last_status_ids(rooms)
    excluded = current_account.excluded_from_timeline_account_ids

    rooms.filter_map(&:last_status).select { |status| excluded.include?(status.account_id) }.map(&:id)
  end
end
