# frozen_string_literal: true

require 'rails_helper'
require Rails.root.join('db', 'migrate', '20261024000000_move_can_be_private_account_permission_bit.rb')

RSpec.describe MoveCanBePrivateAccountPermissionBit do
  subject(:migration) { described_class.new }

  let(:old_bit) { 1 << 20 }
  let(:other_permissions) { UserRole::FLAGS[:manage_reports] | UserRole::FLAGS[:invite_users] }
  let!(:role_with_bit) { Fabricate(:user_role, permissions: other_permissions) }
  let!(:role_without_bit) { Fabricate(:user_role, permissions: other_permissions) }

  before do
    # 옛 코드가 저장한 값을 흉내 낸다. 지금의 FLAGS 로는 이 비트를 만들 수 없다.
    role_with_bit.update_columns(permissions: other_permissions | old_bit)
  end

  it 'moves the old bit to can_be_private_account without granting view_feeds' do
    ActiveRecord::Migration.suppress_messages { migration.up }

    role_with_bit.reload
    expect(role_with_bit.can?(:can_be_private_account)).to be(true)
    expect(role_with_bit.permissions & UserRole::FLAGS[:view_feeds]).to eq(0)
    expect(role_with_bit.permissions & other_permissions).to eq(other_permissions)
  end

  it 'leaves roles without the old bit alone' do
    expect { ActiveRecord::Migration.suppress_messages { migration.up } }
      .to_not(change { role_without_bit.reload.permissions })
  end

  it 'moves the bit back on rollback' do
    ActiveRecord::Migration.suppress_messages do
      migration.up
      migration.down
    end

    expect(role_with_bit.reload.permissions).to eq(other_permissions | old_bit)
  end
end
