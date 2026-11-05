# frozen_string_literal: true

class MoveCanBePrivateAccountPermissionBit < ActiveRecord::Migration[8.0]
  class UserRole < ApplicationRecord; end

  OLD_BIT = (1 << 20)
  NEW_BIT = (1 << 30)

  def up
    move_bit(from: OLD_BIT, to: NEW_BIT)
  end

  def down
    move_bit(from: NEW_BIT, to: OLD_BIT)
  end

  private

  def move_bit(from:, to:)
    UserRole.where('permissions & ? <> 0', from).find_each do |role|
      role.update_columns(permissions: (role.permissions & ~from) | to)
    end
  end
end
