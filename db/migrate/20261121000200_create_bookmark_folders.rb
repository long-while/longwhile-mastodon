# frozen_string_literal: true

class CreateBookmarkFolders < ActiveRecord::Migration[8.0]
  def change
    create_table :bookmark_folders, if_not_exists: true do |t|
      t.references :account, null: false, foreign_key: { on_delete: :cascade }, index: false
      t.string :name, null: false
      t.integer :position, null: false, default: 0

      t.timestamps
    end

    add_index :bookmark_folders, [:account_id, :position], if_not_exists: true

    create_table :bookmark_folder_items, if_not_exists: true do |t|
      t.references :bookmark_folder, null: false, foreign_key: { on_delete: :cascade }, index: false
      t.references :bookmark, null: false, foreign_key: { on_delete: :cascade }, index: true

      t.timestamps
    end

    add_index :bookmark_folder_items, [:bookmark_folder_id, :bookmark_id], unique: true, name: 'index_bookmark_folder_items_on_folder_and_bookmark', if_not_exists: true
  end
end
