# frozen_string_literal: true

# @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
#   방의 참여자. 방 조회 권한의 유일한 근거이기도 하다 — 방 id 는 순차 증가하는
#   정수라 열거가 가능하므로, 이 테이블에 행이 있는지가 방어선이다.
#   근거: dm-chat-phase-1.md §1.1, §4.4
#
#   hidden_at 은 "대화 나가기"(FR-27). 나가면 목록에서만 사라지고, 새 메시지가
#   오면 다시 나타난다. 방과 메시지는 아무것도 지우지 않는다.
#   근거: dm-chat-decisions.md D-05
class CreateDmRoomMembers < ActiveRecord::Migration[8.0]
  def change
    create_table :dm_room_members do |t|
      t.references :dm_room, null: false, foreign_key: { on_delete: :cascade }, index: false
      t.references :account, null: false, foreign_key: { on_delete: :cascade }, index: false

      t.datetime :hidden_at

      t.timestamps
    end

    # 목록 조회는 계정으로 시작한다.
    add_index :dm_room_members, [:account_id, :dm_room_id], unique: true

    # 멤버 검증과 방 단건 조회는 방으로 시작한다.
    add_index :dm_room_members, :dm_room_id
  end
end
