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

# @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
#   "내가 어디까지 읽었는가" 커서. 안 읽은 개수와 "여기까지 읽음" 구분선의 근거다.
#   근거: dm-chat-phase-1.md §4.5, ADR-005
class DmRoomRead < ApplicationRecord
  belongs_to :dm_room
  belongs_to :account
  belongs_to :last_read_status, class_name: 'Status', optional: true

  # 커서는 앞으로만 간다. 오래된 메시지를 열어봤다고 읽음이 되돌아가면, 그 뒤에 온
  # 메시지가 다시 읽지 않음이 되어 배지가 되살아난다.
  #
  # **전진했으면 true, 아니면 false 를 돌려준다.** 부르는 쪽이 그 값을 보고 읽음
  # 이벤트를 발행한다(Phase 4). 무조건 발행하면 방을 열어 둔 채 스크롤할 때마다 같은
  # 값이 계속 나간다. update! 가 true 를 돌려주므로 예전에도 우연히 맞는 값이었지만,
  # 그 우연에 기대지 않도록 명시한다.
  def advance_to!(status_id)
    return false if status_id.blank?
    return false if last_read_status_id.present? && last_read_status_id >= status_id.to_i

    update!(last_read_status_id: status_id, read_at: Time.now.utc)
    true
  end
end
