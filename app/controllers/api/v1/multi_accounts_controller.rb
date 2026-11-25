# frozen_string_literal: true

class Api::V1::MultiAccountsController < Api::BaseController
  include Api::MultiAccountResponse

  DEFAULT_REFRESH_SCOPES = 'read write follow'

  REUSABLE_TOKEN_LOOKUP_LIMIT = 20

  skip_before_action :require_authenticated_user!, only: [:consume, :revoke_refresh_token]
  skip_before_action :require_not_suspended!, only: [:consume, :revoke_refresh_token]

  before_action :require_refresh_token_caller!, only: [:refresh_token]

  def consume
    # NOTE: never log raw params here — payload contains the OAuth authorization_code,
    # state and nonce, all of which are live credentials.
    Rails.logger.debug { 'MultiAccountsController#consume called' }

    payload_params = params.require(:payload).permit(:state, :nonce, :authorization_code, :code_verifier)

    # Verify and consume state from Redis
    MultiAccounts::StateStore.consume!(
      payload_params[:state],
      payload_params[:nonce]
    )

    # Exchange authorization code for access token
    config = Rails.configuration.x.multi_account
    application = Doorkeeper::Application.find_by(uid: config[:client_id])

    unless application
      render json: { error: 'Multi-account OAuth application not found' }, status: 500
      return
    end

    client = Doorkeeper::OAuth::Client.new(application)
    grant = Doorkeeper.config.access_grant_model.by_token(payload_params[:authorization_code])

    unless grant
      render json: { error: '인증 코드를 찾을 수 없거나 이미 사용되었습니다.' }, status: 401
      return
    end

    unless grant.application_id == application.id
      render json: { error: '인증 코드가 OAuth 애플리케이션과 일치하지 않습니다.' }, status: 401
      return
    end

    authorization_request = Doorkeeper::OAuth::AuthorizationCodeRequest.new(
      Doorkeeper.config,
      grant,
      client,
      {
        redirect_uri: config[:redirect_uri],
        code_verifier: payload_params[:code_verifier],
      }.compact
    )

    token_response = authorization_request.authorize

    if token_response.is_a?(Doorkeeper::OAuth::ErrorResponse)
      error_body = token_response.body
      error_message = error_body[:error_description] || error_body[:error] || '인증 코드를 토큰으로 교환하는데 실패했습니다. 다시 시도해주세요.'
      Rails.logger.warn("Multi-account token exchange failed: #{error_message}")
      render json: { error: error_message }, status: token_response.status == :unauthorized ? :unauthorized : :bad_request
      return
    end

    access_token = token_response.token
    begin
      updates = {}
      updates[:multi_account] = true if access_token.respond_to?(:multi_account=)
      if MultiAccountConfig.refresh_flow_enabled?
        updates[:purpose] = 'multi_account_refresh' if access_token.respond_to?(:purpose=)
        updates[:long_lived] = true if access_token.respond_to?(:long_lived=)
      end
      access_token.update!(updates) if updates.present?
      Rails.logger.info("[MultiAccount] Token #{access_token.id} marked: multi_account=#{access_token.try(:multi_account)}, long_lived=#{access_token.try(:long_lived)}, purpose=#{access_token.try(:purpose)}")
    rescue => e
      Rails.logger.error("[MultiAccount] CRITICAL: Failed to mark token #{access_token&.id} with multi-account flags: #{e.message}")
      Rails.logger.error(e.backtrace&.first(5)&.join("\n"))
    end

    resource_owner =
      if Doorkeeper.config.polymorphic_resource_owner?
        access_token.resource_owner
      else
        User.find_by(id: access_token.resource_owner_id)
      end

    unless resource_owner
      render json: { error: '계정을 찾을 수 없습니다.' }, status: 404
      return
    end

    account =
      if resource_owner.respond_to?(:account) && resource_owner.account
        resource_owner.account
      elsif resource_owner.is_a?(Account)
        resource_owner
      else
        Account.find_by(id: access_token.resource_owner_id)
      end

    unless account
      render json: { error: '계정을 찾을 수 없습니다.' }, status: 404
      return
    end

    render json: {
      token: access_token.token,
      account: self_account_json(account),
      scope: access_token.scopes.to_s,
      expires_at: access_token.expires_at&.iso8601,
      state: payload_params[:state],
      nonce: payload_params[:nonce],
    }
  rescue MultiAccounts::StateStore::InvalidStateError => e
    Rails.logger.warn("Multi-account invalid state error: #{e.message}")
    render json: { error: e.message }, status: 401
  rescue ActionController::ParameterMissing => e
    render json: { error: "필수 파라미터 누락: #{e.param}" }, status: 400
  rescue ActiveRecord::RecordNotFound => e
    Rails.logger.error("Multi-account consume error: #{e.message}")
    render json: { error: '계정을 찾을 수 없습니다.' }, status: 404
  rescue => e
    Rails.logger.error("Multi-account consume error: #{e.message}")
    Rails.logger.error(e.backtrace.join("\n"))
    render json: { error: '계정을 추가 중 오류가 발생했습니다. 다시 시도해주세요.' }, status: 500
  end

  def refresh_token
    application = multi_account_application

    unless application
      Rails.logger.error('Multi-account application not found for refresh_token')
      render json: { error: 'Multi-account application not found' }, status: 404
      return
    end

    # Do not grant more than the caller already holds: derive the scopes from the
    # caller's bearer token when present so an API client cannot escalate a read-only
    # token into read/write/follow. Session-authenticated callers (no doorkeeper_token)
    # are already fully trusted and fall back to the default multi-account scopes.
    requested_scopes = doorkeeper_token&.scopes&.to_s.presence || DEFAULT_REFRESH_SCOPES

    token = reusable_refresh_token(application, requested_scopes) ||
            create_refresh_token!(application, requested_scopes)

    render json: {
      token: token.token,
      account: self_account_json(current_user.account),
      scope: token.scopes.to_s,
      expires_at: token.expires_in ? (token.created_at + token.expires_in).iso8601 : nil,
    }
  rescue => e
    Rails.logger.error("Multi-account token refresh failed: #{e.message}")
    Rails.logger.error(e.backtrace.join("\n"))
    render json: { error: '토큰을 갱신하는 중 오류가 발생했습니다.' }, status: 500
  end

  def revoke_refresh_token
    value = params[:refresh_token]
    token = value.is_a?(String) && value.present? ? Doorkeeper::AccessToken.by_token(value) : nil
    token.revoke if token&.long_lived_refresh? && !token.revoked?

    head 204
  end

  private

  def multi_account_application
    client_id = Rails.configuration.x.multi_account[:client_id]
    return if client_id.blank?

    Doorkeeper::Application.find_by(uid: client_id)
  end

  def require_refresh_token_caller!
    unless current_user
      render json: { error: 'This method requires an authenticated user' }, status: 401
      return
    end

    return if doorkeeper_token.nil?
    return if doorkeeper_token.application&.superapp?
    return if doorkeeper_token.try(:multi_account)

    render json: { error: 'This endpoint is only available to the web interface' }, status: 403
  end

  def reusable_refresh_token(application, scopes)
    wanted = scopes.to_s.split.sort

    Doorkeeper::AccessToken
      .long_lived_refresh
      .not_revoked
      .where(application_id: application.id, resource_owner_id: current_user.id)
      .order(created_at: :desc)
      .limit(REUSABLE_TOKEN_LOOKUP_LIMIT)
      .find { |candidate| candidate.scopes.to_s.split.sort == wanted }
  end

  def create_refresh_token!(application, scopes)
    Doorkeeper::AccessToken.create!(
      application: application,
      resource_owner_id: current_user.id,
      scopes: scopes,
      expires_in: 10.years.to_i,
      multi_account: true,
      purpose: 'multi_account_refresh',
      long_lived: true
    )
  end
end
