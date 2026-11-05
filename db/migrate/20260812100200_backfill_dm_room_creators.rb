# frozen_string_literal: true

# @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
#   이미 있던 방의 `creator_id` 를 **루트 메시지의 작성자**로 메꾼다.
#   앞선 20260812100000 이 걸어둔 외래키도 여기서 검증한다.
#
#   **추정이다.** 방을 만든 사람이 어딘가에 기록되어 있지는 않다. 다만 방의 루트
#   (`root_status_id`)는 그 방에서 가장 오래된 메시지이고, 우리 흐름에서 방은
#   누군가 첫 메시지를 보내면서 생긴다. 그 사람이 만든 사람일 확률이 매우 높다.
#
#   틀렸을 때의 결과가 감당할 만한지도 함께 봤다. 이 값이 하는 일은 "그룹에서
#   삭제하기" 버튼을 누구에게 보여줄지 하나뿐이고, 삭제는 방에 안내 메시지를
#   남기므로 조용히 벌어지지 않는다.
#
#   메시지가 하나도 없는 방(`root_status_id IS NULL`)은 메꿔지지 않는다. 그런
#   방에서는 아무도 내보낼 수 없다 — 모르는 것을 아무에게나 주지 않는다.
class BackfillDmRoomCreators < ActiveRecord::Migration[8.0]
  def up
    # safety_assured: strong_migrations 는 마이그레이션 안의 대량 갱신을 막는다.
    # 여기서는 방의 수가 인스턴스 계정 수보다 적고(폐쇄형 5~40인, D-02), 한 번만
    # 도는 UPDATE 라 배치로 쪼갤 이유가 없다.
    safety_assured do
      execute <<~SQL.squish
        UPDATE dm_rooms
           SET creator_id = statuses.account_id
          FROM statuses
         WHERE statuses.id = dm_rooms.root_status_id
           AND dm_rooms.creator_id IS NULL
      SQL
    end

    validate_foreign_key :dm_rooms, :accounts, column: :creator_id

    # 20260812100100 이 `validate: false` 로 걸어둔 것. 방금 만든 빈 테이블이라
    # 검증 자체는 즉시 끝난다.
    validate_foreign_key :dm_room_nicknames, :accounts, column: :target_account_id
  end

  def down
    safety_assured { execute 'UPDATE dm_rooms SET creator_id = NULL' }
  end
end
