# frozen_string_literal: true

# @_longwhile — 상류 4.6 은 사용자마다 `theme` 을 `default` 로 바꾸고 색 구성
# (`web.color_scheme`·`web.contrast`)으로 옮긴다. 이 포크의 고정 프런트와 레이아웃은 그
# 설정을 읽지 않아(logs/v4.6.x.md R3), 돌리면 라이트 테마를 고른 사용자가 테마를 잃는다.
# 되돌릴 수도 없다(down 없음, 사용자 전체 find_each). 그래서 내용을 비운다. 파일과
# 타임스탬프는 schema_migrations 를 상류와 맞추려고 남긴다.
class MigrateUserTheme < ActiveRecord::Migration[8.0]
  def up; end

  def down; end
end
