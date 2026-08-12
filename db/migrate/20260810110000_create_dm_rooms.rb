# frozen_string_literal: true

# @_longwhile custom feature
class CreateDmRooms < ActiveRecord::Migration[8.0]
  def change
    create_table :dm_rooms do |t|
      t.string :participant_key, null: false
      t.integer :member_count, null: false, default: 0

      t.string :title

      t.bigint :root_status_id
      t.bigint :last_status_id

      t.timestamps
    end

    add_index :dm_rooms, :participant_key, unique: true
    add_index :dm_rooms, :last_status_id

    add_index :dm_rooms, :root_status_id

    add_foreign_key :dm_rooms, :statuses, column: :root_status_id, on_delete: :nullify, validate: false
    add_foreign_key :dm_rooms, :statuses, column: :last_status_id, on_delete: :nullify, validate: false
  end
end
