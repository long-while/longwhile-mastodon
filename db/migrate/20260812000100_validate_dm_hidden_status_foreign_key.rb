# frozen_string_literal: true

# @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
#   20260812000000 이 `validate: false` 로 걸어둔 외래키를 검증한다.
#   NOT VALID 인 외래키도 새로 들어오는 행은 막지만 기존 행을 검사하지 않았기
#   때문에 플래너가 그 제약을 신뢰하지 않는다. 여기서 VALID 로 승격한다.
#
#   검증은 참조하는 쪽(dm_hidden_statuses)을 훑는다. 방금 만든 빈 테이블이라
#   실질적인 스캔이 없고, 락도 SHARE UPDATE EXCLUSIVE 라 statuses 쓰기를 막지
#   않는다. 20260810110400 과 같은 이유다.
class ValidateDmHiddenStatusForeignKey < ActiveRecord::Migration[8.0]
  def change
    validate_foreign_key :dm_hidden_statuses, :statuses, column: :status_id
  end
end
