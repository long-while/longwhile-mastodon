# frozen_string_literal: true

# @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
#   "상대당 방 하나" 를 만드는 테이블. 마스토돈의 conversation 은 스레드 단위라
#   같은 사람과의 대화가 여러 개로 쪼개지는데, 방이 그것들을 묶는다.
#   근거: dm-chat-phase-1.md §1.1, ADR-001
#
#   root_status_id / last_status_id 에 ON DELETE SET NULL 외래키를 건다.
#   account_conversations.last_status_id 에는 외래키가 없어 글이 지워지면 참조가
#   뜬 채로 남고, belongs_to 가 required 라 그 행은 이후 update 마다 터진다.
#   같은 실수를 반복하지 않는다.
class CreateDmRooms < ActiveRecord::Migration[8.0]
  def change
    create_table :dm_rooms do |t|
      # 참여자 계정 id 를 본인 포함해 정렬한 뒤 해시한 값. 방의 정체성이다.
      t.string :participant_key, null: false
      t.integer :member_count, null: false, default: 0

      # 그룹 방 제목. 1차에서는 쓰지 않지만 2차에 테이블을 다시 건드리지 않으려고
      # 미리 만들어 둔다. (dm-chat-crosscheck.md §6)
      t.string :title

      t.bigint :root_status_id
      t.bigint :last_status_id

      t.timestamps
    end

    add_index :dm_rooms, :participant_key, unique: true
    add_index :dm_rooms, :last_status_id

    # root 는 갱신할 때만 찾으므로 인덱스가 필요 없어 보이지만, 외래키의
    # ON DELETE SET NULL 이 글 삭제마다 이 컬럼을 훑는다.
    add_index :dm_rooms, :root_status_id

    # validate: false 로 건다. 검증은 20260810110400 에서 따로 한다.
    # 검증까지 한 번에 하면 참조 대상인 statuses(인스턴스에서 가장 큰 테이블)에
    # 쓰기를 막는 락이 걸리고, strong_migrations 가 이것을 거부한다.
    # dm_rooms 는 방금 만든 빈 테이블이라 검증 자체는 즉시 끝난다.
    add_foreign_key :dm_rooms, :statuses, column: :root_status_id, on_delete: :nullify, validate: false
    add_foreign_key :dm_rooms, :statuses, column: :last_status_id, on_delete: :nullify, validate: false
  end
end
