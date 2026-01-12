# frozen_string_literal: true

class AddMultiAccountToOauthAccessTokens < ActiveRecord::Migration[8.0]
  disable_ddl_transaction!

  def up
    unless column_exists?(:oauth_access_tokens, :multi_account)
      add_column :oauth_access_tokens, :multi_account, :boolean, default: false, null: false
    end

    add_index :oauth_access_tokens, :multi_account, algorithm: :concurrently unless index_exists?(:oauth_access_tokens, :multi_account)
  end

  def down
    remove_index :oauth_access_tokens, :multi_account, algorithm: :concurrently if index_exists?(:oauth_access_tokens, :multi_account)
    remove_column :oauth_access_tokens, :multi_account if column_exists?(:oauth_access_tokens, :multi_account)
  end
end


