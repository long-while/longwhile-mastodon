# frozen_string_literal: true

class GrantViewDirectMessagesPermission < ActiveRecord::Migration[8.0]
  class UserRole < ApplicationRecord; end

  MANAGE_ROLES = (1 << 17)
  VIEW_DIRECT_MESSAGES = (1 << 29)

  def up
    UserRole.where('permissions & ? <> 0', MANAGE_ROLES).find_each do |role|
      role.update_columns(permissions: role.permissions | VIEW_DIRECT_MESSAGES)
    end
  end

  def down
    UserRole.where('permissions & ? <> 0', VIEW_DIRECT_MESSAGES).find_each do |role|
      role.update_columns(permissions: role.permissions & ~VIEW_DIRECT_MESSAGES)
    end
  end
end
