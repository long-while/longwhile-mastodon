# frozen_string_literal: true

# @_longwhile custom feature
class BackfillDmRoomCreators < ActiveRecord::Migration[8.0]
  def up
    safety_assured do
      execute <<~SQL.squish
        UPDATE dm_rooms
           SET creator_id = statuses.account_id
          FROM statuses
         WHERE statuses.id = dm_rooms.root_status_id
           AND dm_rooms.creator_id IS NULL
      SQL
    end

    validate_foreign_key :dm_rooms, :accounts, column: :creator_id

    validate_foreign_key :dm_room_nicknames, :accounts, column: :target_account_id
  end

  def down
    safety_assured { execute 'UPDATE dm_rooms SET creator_id = NULL' }
  end
end
