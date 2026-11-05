# frozen_string_literal: true

# @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
#   "나에게서만 삭제". 메시지를 **내 화면에서만** 지운다. 상대에게는 그대로 남는다.
#   근거: dm-chat-phase-3.md B-06, 기획서 §4.3.7
#
#   기존 것으로는 안 된다. `dm_room_members.hidden_at` 은 **방 전체**를 목록에서
#   감추는 것(대화 나가기)이고, `Status#destroy` 는 모두에게서 사라진다. 그 사이가
#   비어 있어서 메뉴에 항목을 못 걸고 있었다.
#
#   방 단위가 아니라 (계정, 글) 단위다. 방을 나갔다 다시 들어와도 숨김은 남고,
#   같은 글이 여러 방에 속하는 일은 없으므로 dm_room_id 를 함께 들 이유가 없다.
#
#   운영진 화면(/messages/all)에는 영향을 주지 않는다. 그쪽은 `room_statuses` 를
#   쓰고 이 필터를 타지 않는다 — 개인의 화면 정리가 감사 기록을 지우면 안 된다.
class CreateDmHiddenStatuses < ActiveRecord::Migration[8.0]
  def change
    create_table :dm_hidden_statuses do |t|
      t.references :account, null: false, foreign_key: { on_delete: :cascade }, index: false
      t.bigint :status_id, null: false

      t.timestamps
    end

    # 조회는 언제나 "이 계정이 숨긴 글들" 이다. 목록 쿼리가 이 인덱스만 탄다.
    # 유니크인 이유는 두 번 눌러도 한 행이어야 하기 때문이다(find_or_create_by).
    add_index :dm_hidden_statuses, [:account_id, :status_id], unique: true

    # 글이 지워질 때 이 행도 함께 지운다. 남겨두면 참조가 뜬 채로 쌓이기만 한다.
    # 인덱스는 ON DELETE CASCADE 가 글 삭제마다 훑으므로 필요하다.
    add_index :dm_hidden_statuses, :status_id

    # validate: false 로 건다. 검증은 20260812000100 에서 따로 한다. 이유는
    # 20260810110000 주석과 같다 — statuses 는 이 인스턴스에서 가장 큰 테이블이라
    # 한 번에 하면 쓰기를 막는 락이 걸리고 strong_migrations 가 거부한다.
    add_foreign_key :dm_hidden_statuses, :statuses, column: :status_id, on_delete: :cascade, validate: false
  end
end
