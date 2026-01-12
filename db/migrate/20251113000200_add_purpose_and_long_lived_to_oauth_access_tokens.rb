# frozen_string_literal: true

class AddPurposeAndLongLivedToOauthAccessTokens < ActiveRecord::Migration[8.0]
  disable_ddl_transaction!

  def change
    # 이미 스키마에 반영된 경우가 있으므로, 존재 여부를 확인한 뒤에만 추가
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

