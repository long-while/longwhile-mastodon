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

# @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
#   방 안에서만 쓰는 별명. 근거: 마이그레이션 20260812100100 주석.
#
#   **내가 지정한 것은 나에게만 보인다.** 상대는 자기에게 무슨 별명이 붙었는지
#   알 수 없다. 그래야 별명이 상대에게 하는 말이 아니라 내 화면을 정리하는
#   수단으로 남는다 — 롤플레잉 서버에서 인물 이름을 적어두는 용도다.
class DmRoomNickname < ApplicationRecord
  MAX_LENGTH = 30

  belongs_to :dm_room
  belongs_to :account
  belongs_to :target_account, class_name: 'Account'

  validates :nickname, presence: true, length: { maximum: MAX_LENGTH }
end
