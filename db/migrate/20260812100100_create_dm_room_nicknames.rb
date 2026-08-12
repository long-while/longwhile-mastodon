# frozen_string_literal: true

# @_longwhile custom feature
class CreateDmRoomNicknames < ActiveRecord::Migration[8.0]
  def change
    create_table :dm_room_nicknames, if_not_exists: true do |t|
      t.references :dm_room, null: false, foreign_key: { on_delete: :cascade }, index: false

      t.references :account, null: false, foreign_key: { on_delete: :cascade }, index: false

      t.bigint :target_account_id, null: false

      t.string :nickname, null: false

      t.timestamps
    end

    add_index :dm_room_nicknames,
              [:dm_room_id, :account_id, :target_account_id],
              unique: true,
              name: 'index_dm_room_nicknames_on_room_and_pair',
              if_not_exists: true

    add_index :dm_room_nicknames, :target_account_id, if_not_exists: true

    add_foreign_key :dm_room_nicknames, :accounts, column: :target_account_id, on_delete: :cascade, validate: false, if_not_exists: true
  end
end
