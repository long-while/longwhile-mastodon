# frozen_string_literal: true

# @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
#   conversation 을 방에 귀속시킨다. 방 하나가 conversation 여럿을 묶는다.
#
#   statuses 가 아니라 conversations 에 컬럼을 붙이는 이유는 크기다. statuses 는
#   인스턴스에서 가장 큰 테이블이고, conversations 는 그에 비해 작다.
#   근거: dm-chat-phase-1.md §1.2, 기획서 §8.2
#
#   CONCURRENTLY 실패 시 복구 절차는
#   20260810100000_add_conversation_id_index_to_statuses.rb 주석 참조.
class AddDmRoomIdToConversations < ActiveRecord::Migration[8.0]
  disable_ddl_transaction!

  def up
    add_column :conversations, :dm_room_id, :bigint unless column_exists?(:conversations, :dm_room_id)

    add_index :conversations, :dm_room_id, algorithm: :concurrently, if_not_exists: true

    # 방이 사라지면 귀속만 풀린다. conversation 과 그 안의 글은 그대로 둔다 —
    # 방은 표시 단위일 뿐이고 대화 자체가 아니다.
    return if foreign_key_exists?(:conversations, :dm_rooms, column: :dm_room_id)

    add_foreign_key :conversations, :dm_rooms, column: :dm_room_id, on_delete: :nullify, validate: false
  end

  def down
    remove_foreign_key :conversations, column: :dm_room_id if foreign_key_exists?(:conversations, :dm_rooms, column: :dm_room_id)
    remove_index :conversations, :dm_room_id, algorithm: :concurrently, if_exists: true
    remove_column :conversations, :dm_room_id if column_exists?(:conversations, :dm_room_id)
  end
end
