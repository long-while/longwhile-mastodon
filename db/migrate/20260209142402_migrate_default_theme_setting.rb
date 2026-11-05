# frozen_string_literal: true

# @_longwhile — 상류 4.6 은 테마를 하나(`default`)로 합치고 사이트 테마 설정
# `mastodon-light`·`contrast`·`system` 을 `default` 로 고쳐 쓴다. 이 포크는 테마 체계를
# 그대로 둔다(bird-ui·theme-ui, `config/themes.yml`, 고정 프런트 — logs/v4.6.x.md R3).
# 고쳐 쓰면 사이트 테마가 포크에 없는 이름으로 바뀌고, 되돌릴 수도 없다(down 없음).
# 그래서 내용을 비운다. 파일과 타임스탬프는 schema_migrations 를 상류와 맞추려고 남긴다.
class MigrateDefaultThemeSetting < ActiveRecord::Migration[8.0]
  def up; end

  def down; end
end
