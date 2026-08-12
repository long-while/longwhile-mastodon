# frozen_string_literal: true

# @_longwhile custom feature
class CreateDmHiddenStatuses < ActiveRecord::Migration[8.0]
  def change
    create_table :dm_hidden_statuses do |t|
      t.references :account, null: false, foreign_key: { on_delete: :cascade }, index: false
      t.bigint :status_id, null: false

      t.timestamps
    end

    add_index :dm_hidden_statuses, [:account_id, :status_id], unique: true

    add_index :dm_hidden_statuses, :status_id

    add_foreign_key :dm_hidden_statuses, :statuses, column: :status_id, on_delete: :cascade, validate: false
  end
end
