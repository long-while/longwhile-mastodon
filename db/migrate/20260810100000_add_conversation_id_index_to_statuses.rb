# frozen_string_literal: true

# @_longwhile custom feature
class AddConversationIdIndexToStatuses < ActiveRecord::Migration[8.0]
  disable_ddl_transaction!

  def up
    add_index :statuses, :conversation_id, algorithm: :concurrently, if_not_exists: true
  end

  def down
    remove_index :statuses, :conversation_id, algorithm: :concurrently, if_exists: true
  end
end
