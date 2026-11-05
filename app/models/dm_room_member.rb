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

# @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
#   방의 참여자. 이 행의 존재가 방 조회 권한의 근거다.
#
#   hidden_at 은 "대화 나가기"(FR-27). 목록에서만 사라지고 방·메시지는 그대로다.
#   새 메시지가 방에 붙으면 DmRoom#unhide_for_everyone! 이 되돌린다.
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
