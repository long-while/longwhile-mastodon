# frozen_string_literal: true

class RevokeLegacyMultiAccountTokens < ActiveRecord::Migration[8.1]
  disable_ddl_transaction!

  BATCH_SIZE = 1000

  class MigrationAccessToken < ApplicationRecord
    self.table_name = 'oauth_access_tokens'
  end

  class MigrationPushSubscription < ApplicationRecord
    self.table_name = 'web_push_subscriptions'
  end

  def up
    now = Time.now.utc

    live_multi_account_tokens.in_batches(of: BATCH_SIZE) do |batch|
      ids = batch.pluck(:id)
      MigrationPushSubscription.where(access_token_id: ids).delete_all
      MigrationAccessToken.where(id: ids, revoked_at: nil).update_all(revoked_at: now)
    end
  end

  def down; end

  private

  def live_multi_account_tokens
    scope = MigrationAccessToken.where(revoked_at: nil)
    owned = scope.where(multi_account: true).or(scope.where(long_lived: true))

    client_id = Rails.configuration.x.multi_account[:client_id].presence
    return owned unless client_id

    owned.or(scope.where('application_id IN (SELECT id FROM oauth_applications WHERE uid = ?)', client_id))
  end
end
