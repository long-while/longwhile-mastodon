# frozen_string_literal: true

# @_longwhile custom feature
class CreateDmRoomReads < ActiveRecord::Migration[8.0]
  def change
    create_table :dm_room_reads do |t|
      t.references :dm_room, null: false, foreign_key: { on_delete: :cascade }, index: false
      t.references :account, null: false, foreign_key: { on_delete: :cascade }, index: false

      t.bigint :last_read_status_id
      t.datetime :read_at

      t.timestamps
    end

    add_index :dm_room_reads, [:dm_room_id, :account_id], unique: true

    add_index :dm_room_reads, :last_read_status_id

    add_foreign_key :dm_room_reads, :statuses, column: :last_read_status_id, on_delete: :nullify, validate: false
  end
end
