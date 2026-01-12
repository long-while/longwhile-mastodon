# frozen_string_literal: true

class MultiAccounts::EntriesController < ApplicationController
  before_action :authenticate_user!

  def show
    state = SecureRandom.uuid
    nonce = SecureRandom.uuid
    config = Rails.configuration.x.multi_account

    MultiAccounts::StateStore.store!(
      state: state,
      nonce: nonce,
      user_id: current_user.id,
      redirect_uri: config[:redirect_uri]
    )

    force_login = ActiveModel::Type::Boolean.new.cast(params.fetch(:force_login, true))

    authorization_params = {
      client_id: config[:client_id],
      redirect_uri: config[:redirect_uri],
      response_type: 'code',
      scope: config_fetch_scopes,
      state: state,
    }
    authorization_params[:prompt] = 'login' if force_login

    authorization_url = oauth_authorization_server_url(authorization_params)

    render json: {
      authorize_url: authorization_url,
      state: state,
      nonce: nonce,
    }
  end

  private

  def config_fetch_scopes
    config_scopes = Rails.configuration.x.multi_account[:scopes]
    return config_scopes if config_scopes.present?

    # Default multi-account scopes if not overridden
    'read write follow push'
  end

  def oauth_authorization_server_url(params)
    uri = URI(root_url)
    uri.path = '/oauth/authorize'
    uri.query = params.to_query
    uri.to_s
  end
end
