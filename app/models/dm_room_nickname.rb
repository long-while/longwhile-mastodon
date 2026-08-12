# frozen_string_literal: true

# == Schema Information
#
# Table name: dm_room_nicknames
#
#  id                :bigint(8)        not null, primary key
#  nickname          :string           not null
#  created_at        :datetime         not null
#  updated_at        :datetime         not null
#  account_id        :bigint(8)        not null
#  dm_room_id        :bigint(8)        not null
#  target_account_id :bigint(8)        not null
#

# @_longwhile custom feature
class DmRoomNickname < ApplicationRecord
  MAX_LENGTH = 30

  belongs_to :dm_room
  belongs_to :account
  belongs_to :target_account, class_name: 'Account'

  validates :nickname, presence: true, length: { maximum: MAX_LENGTH }
end
