# frozen_string_literal: true

require 'rails_helper'
require Rails.root.join('db', 'migrate', '20250717003900_copy_reserved_usernames_to_username_blocks.rb')

RSpec.describe CopyReservedUsernamesToUsernameBlocks do
  subject(:migration) { described_class.new }

  def run_migration
    ActiveRecord::Migration.suppress_messages { migration.up }
  end

  def store_setting(value)
    Setting.where(var: 'reserved_usernames').delete_all
    Setting.new(var: 'reserved_usernames').tap { |setting| setting[:value] = value }.save!(validate: false)
  end

  context 'when the operator added names to the setting' do
    before do
      UsernameBlock.create!(username: 'Keeper', exact: true)
      store_setting(%w(keeper g5Reserved staffbot0 Staffbot0).to_yaml)
    end

    it 'reserves the missing names exactly, skipping ones already blocked' do
      expect { run_migration }.to change(UsernameBlock, :count).by(2)

      expect(UsernameBlock.find_by(username: 'g5Reserved')).to have_attributes(exact: true, allow_with_approval: false, normalized_username: 'gsreserved')
      expect(UsernameBlock.find_by(username: 'staffbot0')).to have_attributes(normalized_username: 'staffboto')
    end

    it 'makes those names unregistrable' do
      run_migration

      expect(Fabricate.build(:account, username: 'g5reserved')).to_not be_valid
      expect(Fabricate.build(:account, username: 'staffbot0')).to_not be_valid
    end

    it 'can run twice' do
      run_migration

      expect { run_migration }.to_not change(UsernameBlock, :count)
    end

    it 'keeps the setting row for a rollback to 4.4' do
      run_migration

      expect(Setting.find_by(var: 'reserved_usernames')).to be_present
    end
  end

  context 'when the setting is missing or empty' do
    it 'does nothing without a row' do
      Setting.where(var: 'reserved_usernames').delete_all

      expect { run_migration }.to_not change(UsernameBlock, :count)
    end

    it 'does nothing with an empty list' do
      store_setting([].to_yaml)

      expect { run_migration }.to_not change(UsernameBlock, :count)
    end

    it 'does nothing with an empty value' do
      store_setting(nil)

      expect { run_migration }.to_not change(UsernameBlock, :count)
    end
  end
end
