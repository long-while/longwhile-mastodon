# frozen_string_literal: true

# @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
#   "내가 어디까지 읽었는가" 커서. 안 읽은 개수(FR-03)와 "여기까지 읽음"
#   구분선(FR-17)의 전제조건이다.
#
#   기존 account_conversations 에는 unread 불리언만 있어 개수를 셀 수 없다.
#   불리언을 집계해서 개수를 만들 수 없으므로 경계값이 따로 필요하다.
#   근거: dm-chat-phase-1.md §1.1·§4.6, ADR-005, 검토 S-1
#
#   "상대가 읽었는가"(Phase 4, 2차)도 같은 테이블을 쓴다. 스키마 변경 없이 열린다.
class CreateDmRoomReads < ActiveRecord::Migration[8.0]
  def change
    create_table :dm_room_reads do |t|
      t.references :dm_room, null: false, foreign_key: { on_delete: :cascade }, index: false
      t.references :account, null: false, foreign_key: { on_delete: :cascade }, index: false

      t.bigint :last_read_status_id
      t.datetime :read_at

      t.timestamps
    end

    add_index :dm_room_reads, [:dm_room_id, :account_id], unique: true

    # 글이 지워져도 커서가 뜬 참조로 남지 않게 한다. 커서는 "어디까지" 를 뜻하는
    # 경계값이라 null 이 되면 "아직 읽지 않음" 으로 되돌아갈 뿐, 깨지지 않는다.
    add_index :dm_room_reads, :last_read_status_id

    # validate: false 인 이유는 20260810110000 주석과 같다. 검증은 20260810110400.
    add_foreign_key :dm_room_reads, :statuses, column: :last_read_status_id, on_delete: :nullify, validate: false
  end
end
