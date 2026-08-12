# frozen_string_literal: true

# @_longwhile custom feature
class AddCreatorToDmRooms < ActiveRecord::Migration[8.0]
  def change
    add_column :dm_rooms, :creator_id, :bigint, if_not_exists: true

    add_foreign_key :dm_rooms, :accounts, column: :creator_id, on_delete: :nullify, validate: false, if_not_exists: true

  end
end
