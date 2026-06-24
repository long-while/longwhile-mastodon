# frozen_string_literal: true

class MultiAccounts::EntriesController < ApplicationController
  before_action :authenticate_user!
  before_action :require_multi_account_client!

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

  # client_id(또는 그에 해당하는 Doorkeeper 앱)가 없으면 빈 client_id로 authorize URL이
  # 만들어져 /oauth/authorize 에서 "Missing required parameter: client_id"로 터진다.
  # 깨진 URL을 내보내는 대신, 운영자가 조치할 수 있도록 명확한 로그/에러를 반환한다.
  def require_multi_account_client!
    client_id = Rails.configuration.x.multi_account[:client_id]
    return if client_id.present? && Doorkeeper::Application.exists?(uid: client_id)

    Rails.logger.error(
      'Multi-account OAuth client is not configured (missing or unknown client_id). ' \
      'Run `RAILS_ENV=production bundle exec rails multi_accounts:ensure_client` and restart the service.'
    )

    render json: {
      error: '계정 전환 기능이 아직 설정되지 않았습니다. 서버 관리자에게 문의해주세요.',
    }, status: :service_unavailable
  end

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
