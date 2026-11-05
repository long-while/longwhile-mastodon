# frozen_string_literal: true

# @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
#   방을 만든 사람. "그룹에서 삭제하기" 를 할 수 있는 유일한 사람이다.
#   근거: 2026-08-12 결정 (멤버 관리)
#
#   권한을 방장 하나로 좁힌 이유는 단순하다. 누구나 아무나 내보낼 수 있으면
#   말다툼이 곧 강퇴가 된다. 반대로 역할 테이블까지 만들면 5~40인 서버(D-02)에
#   비해 과하다. 그 중간이 "만든 사람" 이다.
#
#   NULL 을 허용한다. 이 컬럼이 생기기 전에 만들어진 방에는 만든 사람이 기록되어
#   있지 않다. 아래 20260812100200 이 **루트 메시지의 작성자**로 메꾸지만, 그것도
#   추정이라 메꿔지지 않는 방이 남을 수 있다. 그런 방에서는 아무도 내보낼 수
#   없다 — 위험한 쪽으로 틀리지 않는 기본값이다.
class AddCreatorToDmRooms < ActiveRecord::Migration[8.0]
  def change
    # `if_not_exists` 를 붙인 이유가 있다. 이 마이그레이션은 원래 인덱스까지
    # 함께 걸었는데, strong_migrations 가 그 인덱스에서 중단시켰다. 포스트그레스는
    # DDL 이 트랜잭션이라 컬럼도 함께 되감겼지만 — 그 전제에 기대지 않는다.
    # 다시 돌릴 때 "이미 있다" 로 또 막히면 사람이 손으로 치워야 한다.
    add_column :dm_rooms, :creator_id, :bigint, if_not_exists: true

    # accounts 는 statuses 만큼 크지 않지만, 이 저장소의 DM 마이그레이션은
    # 전부 검증을 분리해 두었다(20260810110400). 같은 형태를 지킨다.
    add_foreign_key :dm_rooms, :accounts, column: :creator_id, on_delete: :nullify, validate: false, if_not_exists: true

    # **인덱스는 여기 없다.** `dm_rooms` 는 이미 있는 테이블이라, 인덱스를 보통
    # 방식으로 걸면 그동안 쓰기가 막힌다. strong_migrations 가 그것을 거부한다
    # (실제로 한 번 막혔다). 20260812100010 에서 `concurrently` 로 건다.
  end
end
