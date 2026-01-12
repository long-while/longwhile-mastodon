# frozen_string_literal: true

class EnsureMultiAccountScopes < ActiveRecord::Migration[8.0]
  DESIRED_SCOPES = 'read write follow push'
  MULTI_ACCOUNT_APP_NAME = 'Web'

  def up
    app = find_multi_account_application
    return unless app

    return if app.scopes.to_s.strip == DESIRED_SCOPES

    say "Updating #{app.name} (uid=#{app.uid}) scopes to #{DESIRED_SCOPES}"
    app.update!(scopes: DESIRED_SCOPES)
  end

  def down
    # No rollback – scopes can be adjusted manually if needed.
  end

  private

  def find_multi_account_application
    return unless defined?(Doorkeeper::Application)

    Doorkeeper::Application.find_by(name: MULTI_ACCOUNT_APP_NAME) ||
      find_by_configured_client_id
  end

  def find_by_configured_client_id
    client_id =
      Rails.configuration.x.multi_account[:client_id] rescue nil

    return if client_id.blank?

    Doorkeeper::Application.find_by(uid: client_id)
  end
end

