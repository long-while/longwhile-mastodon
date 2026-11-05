# frozen_string_literal: true

class AddCreatorIndexToDmRooms < ActiveRecord::Migration[8.0]
  disable_ddl_transaction!

  def change
    add_index :dm_rooms, :creator_id, algorithm: :concurrently
  end
end
