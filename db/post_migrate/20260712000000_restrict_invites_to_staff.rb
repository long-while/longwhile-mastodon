# frozen_string_literal: true

# @_longwhile custom feature / 한참(longwhile) 제작 기능 — 서버 초대 운영진 전용화
#   기존 인스턴스에서는 everyone(기본) 역할에 invite_users 가 이미 저장되어 있어
#   일반 사용자도 초대 링크를 만들 수 있었다. 이 마이그레이션으로:
#     - everyone 역할에서 invite_users 제거 (일반 사용자 초대 불가)
#     - Admin / Moderator 역할에 invite_users 부여 (운영진만 초대 가능)
#   Owner 는 administrator 플래그로 모든 권한을 가지므로 별도 처리 불필요.
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
