# frozen_string_literal: true

# @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
#   방 안에서만 쓰는 별명. 근거: 2026-08-12 결정 (멤버 관리)
#
#   **(방, 지정한 사람, 대상) 세 값이 열쇠다.** 방마다 다른 별명을 둘 수 있고,
#   같은 사람을 두고도 사람마다 다르게 부를 수 있다. 롤플레잉 서버에서는 같은
#   계정이 방마다 다른 인물인 경우가 흔해서, 계정 단위 별명으로는 모자란다.
#
#   전역(계정 단위)으로 하지 않은 이유가 하나 더 있다. 그러려면 타임라인·알림·
#   검색까지 표시 이름을 갈아 끼워야 하는데, 그 경로는 직렬화기 여러 개와
#   `display_name_html`(서버에서 이모지까지 박아 만든 HTML)을 통째로 건드린다.
#   채팅 안에서만 쓰면 그 경로를 하나도 건드리지 않는다.
class CreateDmRoomNicknames < ActiveRecord::Migration[8.0]
  def change
    # `if_not_exists` 는 이 마이그레이션이 한 번 중단된 적이 있어서 붙였다
    # (아래 외래키에서 strong_migrations 에 막혔다). 포스트그레스는 DDL 이
    # 트랜잭션이라 테이블도 함께 되감겼지만, 그 전제에 기대지 않는다.
    create_table :dm_room_nicknames, if_not_exists: true do |t|
      t.references :dm_room, null: false, foreign_key: { on_delete: :cascade }, index: false

      # 별명을 **지정한** 사람. 이 사람에게만 보인다.
      t.references :account, null: false, foreign_key: { on_delete: :cascade }, index: false

      # 별명이 **붙는** 사람.
      t.bigint :target_account_id, null: false

      t.string :nickname, null: false

      t.timestamps
    end

    # 조회는 언제나 "이 방에서 내가 지정한 별명 전부" 다. 앞의 두 값으로 시작하는
    # 이 인덱스 하나가 그것과 유일성을 함께 맡는다.
    add_index :dm_room_nicknames,
              [:dm_room_id, :account_id, :target_account_id],
              unique: true,
              name: 'index_dm_room_nicknames_on_room_and_pair',
              if_not_exists: true

    # 대상 계정이 지워지면 별명도 함께 지운다. 남겨두면 참조가 뜬 채로 쌓인다.
    add_index :dm_room_nicknames, :target_account_id, if_not_exists: true

    # **검증은 20260812100200 에서 따로 한다.**
    #
    # 위 `t.references` 두 개는 `create_table` 안이라 그냥 통과하는데, 이렇게
    # 밖에서 거는 외래키는 새 테이블이어도 strong_migrations 가 막는다 —
    # 실제로 한 번 막혔다. "새 테이블이니 봐주겠지" 가 통하는 것은 인덱스와
    # `create_table` 안의 외래키뿐이다.
    add_foreign_key :dm_room_nicknames, :accounts, column: :target_account_id, on_delete: :cascade, validate: false, if_not_exists: true
  end
end
