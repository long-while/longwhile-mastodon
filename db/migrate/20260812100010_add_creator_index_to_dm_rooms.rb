# frozen_string_literal: true

# @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
#   `dm_rooms.creator_id` 인덱스. 20260812100000 에서 떼어 왔다.
#
#   **왜 따로인가.** `dm_rooms` 는 이미 있는 테이블이라, 인덱스를 보통 방식으로
#   걸면 만드는 동안 그 테이블의 쓰기가 막힌다. strong_migrations 가 그것을
#   거부한다 — 실제로 한 번 막혔다.
#
#   `algorithm: :concurrently` 는 쓰기를 막지 않는 대신 **트랜잭션 안에서 돌 수
#   없다.** 그래서 `disable_ddl_transaction!` 이 함께 있어야 한다. 둘 중 하나만
#   적으면 그 자리에서 터진다.
#
#   트랜잭션이 없다는 것은 실패해도 되감기지 않는다는 뜻이기도 하다. 그래서
#   이 파일에는 인덱스 하나만 둔다 — 컬럼 추가와 섞여 있으면 인덱스에서 실패한
#   뒤 다시 돌릴 때 컬럼이 이미 있다며 또 터진다. (`if_not_exists` 는 실패한
#   인덱스가 INVALID 로 남는 경우를 덮지 못하므로 기대지 않는다.)
#
#   인덱스가 필요한 이유는 외래키의 `ON DELETE SET NULL` 이다. 계정이 지워질
#   때마다 이 컬럼을 훑는다.
class AddCreatorIndexToDmRooms < ActiveRecord::Migration[8.0]
  disable_ddl_transaction!

  def change
    add_index :dm_rooms, :creator_id, algorithm: :concurrently
  end
end
