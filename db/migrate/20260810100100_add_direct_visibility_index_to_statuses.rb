# frozen_string_literal: true

# @_longwhile custom feature
class AddDirectVisibilityIndexToStatuses < ActiveRecord::Migration[8.0]
  disable_ddl_transaction!

  INDEX_NAME = 'index_statuses_direct_by_id'

  def up
    add_index :statuses,
              :id,
              order: { id: :desc },
              where: 'visibility = 3 AND deleted_at IS NULL',
              name: INDEX_NAME,
              algorithm: :concurrently,
              if_not_exists: true
  end

  def down
    remove_index :statuses, name: INDEX_NAME, algorithm: :concurrently, if_exists: true
  end
end
