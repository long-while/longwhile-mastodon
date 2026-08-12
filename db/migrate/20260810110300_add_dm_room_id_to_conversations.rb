# frozen_string_literal: true

# @_longwhile custom feature
class AddDmRoomIdToConversations < ActiveRecord::Migration[8.0]
  disable_ddl_transaction!

  def up
    add_column :conversations, :dm_room_id, :bigint unless column_exists?(:conversations, :dm_room_id)

    add_index :conversations, :dm_room_id, algorithm: :concurrently, if_not_exists: true

    return if foreign_key_exists?(:conversations, :dm_rooms, column: :dm_room_id)

    add_foreign_key :conversations, :dm_rooms, column: :dm_room_id, on_delete: :nullify, validate: false
  end

  def down
    remove_foreign_key :conversations, column: :dm_room_id if foreign_key_exists?(:conversations, :dm_rooms, column: :dm_room_id)
    remove_index :conversations, :dm_room_id, algorithm: :concurrently, if_exists: true
    remove_column :conversations, :dm_room_id if column_exists?(:conversations, :dm_room_id)
  end
end
