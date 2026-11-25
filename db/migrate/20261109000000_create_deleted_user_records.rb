# frozen_string_literal: true

class CreateDeletedUserRecords < ActiveRecord::Migration[8.1]
  def change
    create_table :deleted_user_records do |t|
      t.references :account, null: false, foreign_key: { on_delete: :cascade }, index: { unique: true }
      t.string :email, null: false, default: ''
      t.string :locale
      t.datetime :confirmed_at
      t.datetime :current_sign_in_at
      t.inet :sign_up_ip
      t.references :invited_by_account, foreign_key: { to_table: :accounts, on_delete: :nullify }
      t.timestamps
      t.index :created_at
    end

    create_table :deleted_user_ips do |t| # rubocop:disable Rails/CreateTableWithTimestamps
      t.references :deleted_user_record, null: false, foreign_key: { on_delete: :cascade }
      t.inet :ip, null: false
      t.datetime :used_at, null: false
      t.index :ip
    end
  end
end
