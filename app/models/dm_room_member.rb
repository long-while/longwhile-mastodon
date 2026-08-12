# frozen_string_literal: true

# == Schema Information
#
# Table name: dm_room_members
#
#  id         :bigint(8)        not null, primary key
#  hidden_at  :datetime
#  created_at :datetime         not null
#  updated_at :datetime         not null
#  account_id :bigint(8)        not null
#  dm_room_id :bigint(8)        not null
#

# @_longwhile custom feature
class DmRoomMember < ApplicationRecord
  belongs_to :dm_room
  belongs_to :account

  scope :visible, -> { where(hidden_at: nil) }

  def hidden?
    hidden_at.present?
  end

  def hide!
    update!(hidden_at: Time.now.utc)
  end
end
