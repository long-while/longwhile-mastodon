# frozen_string_literal: true

# @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 운영 관리
#   /admin/direct_messages 는 `visibility = direct` 를 id 역순으로 훑는다.
#   visibility 에 인덱스가 없어 PK 역스캔 + 필터로 돌고 있었다. 채팅 UI 가 열리면
#   direct 발생량이 자릿수 단위로 늘어나므로 미리 부분 인덱스를 둔다.
#   근거: dm-chat-phase-0.md P0-5, dm-chat-decisions.md D-08
#
#   visibility 열거값은 app/models/concerns/status/visibility.rb 기준 direct = 3.
#   부분 인덱스 조건에는 열거 이름을 쓸 수 없어 정수를 직접 적는다.
#
#   CONCURRENTLY 실패 시 복구 절차는
#   20260810100000_add_conversation_id_index_to_statuses.rb 주석 참조.
class AddDirectVisibilityIndexToStatuses < ActiveRecord::Migration[8.0]
  disable_ddl_transaction!

  INDEX_NAME = 'index_statuses_direct_by_id'

  def up
    # deleted_at 조건을 함께 건다. 실제 쿼리는 Status 의 default_scope(recent.kept)
    # 때문에 항상 `deleted_at IS NULL` 을 달고 나가며, statuses 의 다른 부분 인덱스도
    # 같은 조건을 포함한다. 조건을 맞춰야 힙 재검사 없이 인덱스만으로 걸러진다.
    add_index :statuses,
              :id,
              order: { id: :desc },
              where: 'visibility = 3 AND deleted_at IS NULL',
              name: INDEX_NAME,
              algorithm: :concurrently,
              if_not_exists: true
  end

  def down
    remove_index :statuses, name: INDEX_NAME, algorithm: :concurrently, if_exists: true
  end
end
