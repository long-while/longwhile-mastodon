# frozen_string_literal: true

require 'rails_helper'
require Rails.root.join('db', 'migrate', '20261121000100_grant_view_direct_messages_permission.rb')

RSpec.describe GrantViewDirectMessagesPermission do
  subject(:migration) { described_class.new }

  let(:view_direct_messages) { UserRole::FLAGS[:view_direct_messages] }
  let!(:role_manager) { Fabricate(:user_role, permissions: UserRole::FLAGS[:manage_roles] | UserRole::FLAGS[:manage_users]) }
  let!(:moderator) { Fabricate(:user_role, permissions: UserRole::FLAGS[:manage_reports]) }

  it 'keeps DM access for roles that could read DMs through manage_roles' do
    ActiveRecord::Migration.suppress_messages { migration.up }

    expect(role_manager.reload.permissions & view_direct_messages).to eq(view_direct_messages)
    expect(role_manager.permissions & UserRole::FLAGS[:manage_users]).to eq(UserRole::FLAGS[:manage_users])
  end

  it 'does not grant it to other roles' do
    expect { ActiveRecord::Migration.suppress_messages { migration.up } }
      .to_not(change { moderator.reload.permissions })
  end

  it 'removes it again on rollback' do
    ActiveRecord::Migration.suppress_messages do
      migration.up
      migration.down
    end

    expect(role_manager.reload.permissions & view_direct_messages).to eq(0)
  end

  def run_up
    ActiveRecord::Migration.suppress_messages { migration.up }
  end

  describe 'boundaries' do
    it 'leaves an administrator-only role (owner) unchanged' do
      owner = Fabricate(:user_role, permissions: UserRole::FLAGS[:administrator])

      expect { run_up }.to_not(change { owner.reload.permissions })
    end

    it 'leaves the everyone role unchanged' do
      everyone = UserRole.everyone

      expect { run_up }.to_not(change { everyone.reload.permissions })
    end

    it 'leaves a role that already has the bit alone' do
      reader = Fabricate(:user_role, permissions: UserRole::FLAGS[:manage_roles] | view_direct_messages)

      expect { run_up }.to_not(change { reader.reload.permissions })
    end

    it 'keeps the can_be_private_account bit (1 << 30) next to the new one' do
      private_role = Fabricate(:user_role, permissions: UserRole::FLAGS[:manage_roles] | UserRole::FLAGS[:can_be_private_account])

      run_up

      expect(private_role.reload.permissions).to eq(UserRole::FLAGS[:manage_roles] | UserRole::FLAGS[:can_be_private_account] | view_direct_messages)
    end

    it 'is idempotent when run twice' do
      run_up
      expect { run_up }.to_not(change { role_manager.reload.permissions })
    end

    it 'removes only its own bit on rollback' do
      ActiveRecord::Migration.suppress_messages do
        migration.up
        migration.down
      end

      expect(role_manager.reload.permissions).to eq(UserRole::FLAGS[:manage_roles] | UserRole::FLAGS[:manage_users])
    end
  end
end
