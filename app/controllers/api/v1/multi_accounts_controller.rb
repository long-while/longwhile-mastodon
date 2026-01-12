# frozen_string_literal: true

class Api::V1::MultiAccountsController < Api::BaseController
  # 다중 계정 consume 엔드포인트는 팝업에서 이미 인증된 authorization code를 처리하므로
  # 별도의 doorkeeper 인증이나 로그인 세션을 요구하지 않는다.
  skip_before_action :require_authenticated_user!, only: [:consume]
  skip_before_action :require_not_suspended!, only: [:consume]

  def consume
    Rails.logger.info("MultiAccountsController#consume called with params: #{params.inspect}")
    
    payload_params = params.require(:payload).permit(:state, :nonce, :authorization_code)

    # Verify and consume state from Redis
    state_data = MultiAccounts::StateStore.consume!(
      payload_params[:state],
      payload_params[:nonce]
    )

    # Exchange authorization code for access token
    config = Rails.configuration.x.multi_account
    application = Doorkeeper::Application.find_by(uid: config[:client_id])

    unless application
      render json: { error: 'Multi-account OAuth application not found' }, status: :internal_server_error
      return
    end

    client = Doorkeeper::OAuth::Client.new(application)
    grant = Doorkeeper.config.access_grant_model.by_token(payload_params[:authorization_code])

    unless grant
      render json: { error: '인증 코드를 찾을 수 없거나 이미 사용되었습니다.' }, status: :unauthorized
      return
    end

    unless grant.application_id == application.id
      render json: { error: '인증 코드가 OAuth 애플리케이션과 일치하지 않습니다.' }, status: :unauthorized
      return
    end

    authorization_request = Doorkeeper::OAuth::AuthorizationCodeRequest.new(
      Doorkeeper.config,
      grant,
      client,
      {
        redirect_uri: config[:redirect_uri],
        code_verifier: payload_params[:code_verifier],
      }.compact,
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
    rescue StandardError => e
      Rails.logger.warn("Failed to mark multi-account token #{access_token&.id}: #{e.message}")
    end

    resource_owner =
      if Doorkeeper.config.polymorphic_resource_owner?
        access_token.resource_owner
      else
        User.find_by(id: access_token.resource_owner_id)
      end

    unless resource_owner
      render json: { error: '계정을 찾을 수 없습니다.' }, status: :not_found
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
      render json: { error: '계정을 찾을 수 없습니다.' }, status: :not_found
      return
    end

    render json: {
      token: access_token.token,
      account: REST::AccountSerializer.new(account).as_json,
      scope: access_token.scopes.to_s,
      expires_at: access_token.expires_at&.iso8601,
      state: payload_params[:state],
      nonce: payload_params[:nonce],
    }
  rescue MultiAccounts::StateStore::InvalidStateError => e
    Rails.logger.warn("Multi-account invalid state error: #{e.message}")
    render json: { error: e.message }, status: :unauthorized
  rescue ActionController::ParameterMissing => e
    render json: { error: "필수 파라미터 누락: #{e.param}" }, status: :bad_request
  rescue ActiveRecord::RecordNotFound => e
    Rails.logger.error("Multi-account consume error: #{e.message}")
    render json: { error: '계정을 찾을 수 없습니다.' }, status: :not_found
  rescue StandardError => e
    Rails.logger.error("Multi-account consume error: #{e.message}")
    Rails.logger.error(e.backtrace.join("\n"))
    render json: { error: '계정을 추가 중 오류가 발생했습니다. 다시 시도해주세요.' }, status: :internal_server_error
  end

  def refresh_token
    config = Rails.configuration.x.multi_account
    application = Doorkeeper::Application.find_by(uid: config[:client_id])

    unless application
      Rails.logger.error('Multi-account application not found for refresh_token')
      render json: { error: 'Multi-account application not found' }, status: :not_found
      return
    end

    token = Doorkeeper::AccessToken.create!(
      application: application,
      resource_owner_id: current_user.id,
      scopes: 'read write follow',
      expires_in: 10.years.to_i
    )

    begin
      updates = {}
      updates[:multi_account] = true if token.respond_to?(:multi_account=)
      updates[:purpose] = 'multi_account_refresh' if token.respond_to?(:purpose=)
      updates[:long_lived] = true if token.respond_to?(:long_lived=)
      token.update!(updates) if updates.present?
    rescue StandardError => e
      Rails.logger.warn("Failed to mark multi-account refresh token #{token&.id}: #{e.message}")
    end

    account = current_user.account

    render json: {
      token: token.token,
      account: REST::AccountSerializer.new(account).as_json,
      scope: token.scopes.to_s,
      expires_at: token.expires_in ? (Time.current + token.expires_in).iso8601 : nil
    }
  rescue StandardError => e
    Rails.logger.error("Multi-account token refresh failed: #{e.message}")
    Rails.logger.error(e.backtrace.join("\n"))
    render json: { error: '토큰을 갱신하는 중 오류가 발생했습니다.' }, status: :internal_server_error
  end
end
