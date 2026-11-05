# frozen_string_literal: true

class RestrictInvitesToStaff < ActiveRecord::Migration[8.0]
  disable_ddl_transaction!

  class UserRole < ApplicationRecord
    EVERYONE_ROLE_ID = -99
    INVITE_USERS = (1 << 16)
  end

  def up
    everyone_role = UserRole.find_by(id: UserRole::EVERYONE_ROLE_ID)
    if everyone_role
      everyone_role.permissions &= ~UserRole::INVITE_USERS
      everyone_role.save
    end

    %w(Admin Moderator).each do |name|
      role = UserRole.find_by(name: name)
      next unless role

      role.permissions |= UserRole::INVITE_USERS
      role.save
    end
  end

  def down
    everyone_role = UserRole.find_by(id: UserRole::EVERYONE_ROLE_ID)
    if everyone_role
      everyone_role.permissions |= UserRole::INVITE_USERS
      everyone_role.save
    end

    %w(Admin Moderator).each do |name|
      role = UserRole.find_by(name: name)
      next unless role

      role.permissions &= ~UserRole::INVITE_USERS
      role.save
    end
  end
end
