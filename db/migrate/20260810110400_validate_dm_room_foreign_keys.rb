# frozen_string_literal: true

# @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
#   앞선 세 마이그레이션이 `validate: false` 로 걸어둔 외래키를 검증한다.
#   NOT VALID 인 외래키도 새로 들어오는 행은 막지만, 기존 행을 검사하지 않았기
#   때문에 플래너가 그 제약을 신뢰하지 않는다. 여기서 VALID 로 승격한다.
#
#   검증은 참조하는 쪽(dm_rooms / dm_room_reads / conversations)을 훑는다.
#   앞의 둘은 방금 만든 빈 테이블이고, conversations 는 dm_room_id 가 전부 NULL
#   이라 어느 쪽도 실질적인 스캔이 없다. 락도 SHARE UPDATE EXCLUSIVE 라
#   statuses 쓰기를 막지 않는다.
#
#   `add_foreign_key ... validate: false` 를 쓴 곳을 늘리면 여기에도 함께 적는다.
#   빠뜨리면 그 외래키만 영영 NOT VALID 로 남는다.
class ValidateDmRoomForeignKeys < ActiveRecord::Migration[8.0]
  def change
    validate_foreign_key :dm_rooms, :statuses, column: :root_status_id
    validate_foreign_key :dm_rooms, :statuses, column: :last_status_id
    validate_foreign_key :dm_room_reads, :statuses, column: :last_read_status_id
    validate_foreign_key :conversations, :dm_rooms, column: :dm_room_id
  end
end
