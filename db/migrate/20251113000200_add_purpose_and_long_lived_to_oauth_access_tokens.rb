# frozen_string_literal: true

class AddPurposeAndLongLivedToOAuthAccessTokens < ActiveRecord::Migration[8.0]
  disable_ddl_transaction!

  def change
    unless column_exists?(:oauth_access_tokens, :purpose)
      add_column :oauth_access_tokens, :purpose, :string, limit: 50
    end

    unless column_exists?(:oauth_access_tokens, :long_lived)
      add_column :oauth_access_tokens, :long_lived, :boolean, default: false, null: false
    end

    unless index_exists?(:oauth_access_tokens, :purpose)
      add_index :oauth_access_tokens, :purpose, algorithm: :concurrently
    end

    unless index_exists?(:oauth_access_tokens, %i[multi_account long_lived])
      add_index :oauth_access_tokens, %i[multi_account long_lived], algorithm: :concurrently
    end
  end
end
