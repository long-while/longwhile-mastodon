# frozen_string_literal: true

# @_longwhile custom feature
class CreateDmRoomMembers < ActiveRecord::Migration[8.0]
  def change
    create_table :dm_room_members do |t|
      t.references :dm_room, null: false, foreign_key: { on_delete: :cascade }, index: false
      t.references :account, null: false, foreign_key: { on_delete: :cascade }, index: false

      t.datetime :hidden_at

      t.timestamps
    end

    add_index :dm_room_members, [:account_id, :dm_room_id], unique: true

    add_index :dm_room_members, :dm_room_id
  end
end
