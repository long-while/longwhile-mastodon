# frozen_string_literal: true

# @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
#   방 메시지 조회는 conversation_id 로 statuses 를 훑는다. 상류에는 이 인덱스가
#   있으나 우리 4.4.0 기준선에는 없어, 없이 진행하면 방을 열 때마다 statuses
#   전체 스캔이 돈다.
#   근거: dm-chat-phase-0.md P0-1, dm-chat-crosscheck.md §1.1
#
#   CONCURRENTLY 는 실패 시 INVALID 인덱스를 남긴다. 주의할 점은 `if_not_exists` 도
#   `index_exists?` 도 유효성(indisvalid)을 보지 않는다는 것이다. 무효 인덱스가 남아
#   있으면 이 마이그레이션이 조용히 건너뛰고 성공으로 기록되며, 플래너는 그 인덱스를
#   쓰지 않으면서 쓰기 비용만 물린다. 배포 후 반드시 아래를 확인한다.
#
#     SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;
#     DROP INDEX CONCURRENTLY IF EXISTS index_statuses_on_conversation_id;
#
#   무효 인덱스를 지운 뒤 이 마이그레이션을 다시 실행한다.
#
#   부분 인덱스(`WHERE conversation_id IS NOT NULL`)는 채택하지 않았다. 운영 DB 의
#   NULL 비율을 잴 수 없는 환경에서 작성했고, direct 가 아닌 글도 conversation_id 를
#   갖기 때문에 NULL 비율이 낮을 것으로 보인다. 실측 후 필요하면 후속으로 바꾼다.
class AddConversationIdIndexToStatuses < ActiveRecord::Migration[8.0]
  disable_ddl_transaction!

  def up
    add_index :statuses, :conversation_id, algorithm: :concurrently, if_not_exists: true
  end

  def down
    remove_index :statuses, :conversation_id, algorithm: :concurrently, if_exists: true
  end
end
