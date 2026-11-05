# frozen_string_literal: true

# @_longwhile — 역할 권한 비트 자리 옮기기
#   이 포크는 `can_be_private_account` 를 1 << 20 에 두었는데, 업스트림 4.5 가 같은
#   자리에 `view_feeds`(꺼 둔 실시간·주제 피드도 볼 수 있는 권한)를 넣었다. 그대로
#   두면 그 권한을 켜 둔 역할이 업그레이드 순간 view_feeds 를 얻는다. 코드는 1 << 30
#   을 쓰도록 바꿨으므로, 저장된 값도 같이 옮긴다.
#
#   새 코드가 1 << 20 을 view_feeds 로 읽기 시작하기 전에 끝나야 하므로 배포 전
#   마이그레이션(db/migrate)에 둔다.
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
