# frozen_string_literal: true

class CreateMultiAccountLinks < ActiveRecord::Migration[8.0]
  def change
    create_table :multi_account_links, if_not_exists: true do |t|
      t.references :user, null: false, foreign_key: { on_delete: :cascade }, index: false
      t.references :peer_user, null: false, foreign_key: { to_table: :users, on_delete: :cascade }, index: true

      t.timestamps
    end

    add_index :multi_account_links, [:user_id, :peer_user_id], unique: true, if_not_exists: true
  end
end
