# frozen_string_literal: true

# == Schema Information
#
# Table name: dm_room_reads
#
#  id                  :bigint(8)        not null, primary key
#  read_at             :datetime
#  created_at          :datetime         not null
#  updated_at          :datetime         not null
#  account_id          :bigint(8)        not null
#  dm_room_id          :bigint(8)        not null
#  last_read_status_id :bigint(8)
#

# @_longwhile custom feature
class DmRoomRead < ApplicationRecord
  belongs_to :dm_room
  belongs_to :account
  belongs_to :last_read_status, class_name: 'Status', optional: true

  def advance_to!(status_id)
    return if status_id.blank?
    return if last_read_status_id.present? && last_read_status_id >= status_id.to_i

    update!(last_read_status_id: status_id, read_at: Time.now.utc)
  end
end
