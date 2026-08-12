# frozen_string_literal: true

# @_longwhile custom feature
class ValidateDmRoomForeignKeys < ActiveRecord::Migration[8.0]
  def change
    validate_foreign_key :dm_rooms, :statuses, column: :root_status_id
    validate_foreign_key :dm_rooms, :statuses, column: :last_status_id
    validate_foreign_key :dm_room_reads, :statuses, column: :last_read_status_id
    validate_foreign_key :conversations, :dm_rooms, column: :dm_room_id
  end
end
