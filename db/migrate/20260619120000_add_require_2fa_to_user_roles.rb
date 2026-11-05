# frozen_string_literal: true

# @_longwhile — 상류 4.6 의 20260211132603_add_require2_fa_to_user_roles 가 같은 컬럼을 더한다.
# 빈 DB 를 마이그레이션으로 처음부터 만들면 그쪽이 먼저(타임스탬프가 앞) 돌기 때문에,
# 여기서는 있으면 건너뛴다.
class AddRequire2faToUserRoles < ActiveRecord::Migration[8.0]
  def up
    return if column_exists?(:user_roles, :require_2fa)

    add_column :user_roles, :require_2fa, :boolean, null: false, default: false
  end

  def down
    remove_column :user_roles, :require_2fa if column_exists?(:user_roles, :require_2fa)
  end
end
