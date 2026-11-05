# frozen_string_literal: true

# @_longwhile — 이 포크는 같은 컬럼을 20260619120000_add_require_2fa_to_user_roles 로 먼저
# 만들었다(상류 #37701 의 이른 백포트). 운영 DB 에는 컬럼이 이미 있어 이 마이그레이션이
# "column already exists" 로 멈춘다. 그래서 있으면 건너뛴다. 타임스탬프와 클래스 이름은
# 상류 그대로 둔다(schema_migrations 가 상류와 맞아야 한다).
#
# down 은 아무것도 하지 않는다. 컬럼은 포크의 마이그레이션도 기대므로, 이것만 되돌린다고
# 지우면 안 된다.
class AddRequire2FaToUserRoles < ActiveRecord::Migration[8.0]
  def up
    return if column_exists?(:user_roles, :require_2fa)

    add_column :user_roles, :require_2fa, :boolean, null: false, default: false
  end

  def down; end
end
