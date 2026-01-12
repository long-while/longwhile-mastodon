# frozen_string_literal: true

class Api::V1::MultiAccounts::SessionsController < Api::BaseController
  skip_before_action :require_authenticated_user!, only: :refresh
  skip_before_action :require_not_suspended!, only: :refresh

  def refresh
    unless MultiAccountConfig.refresh_flow_enabled?
      render json: { error: 'Multi-account refresh flow is disabled' }, status: :forbidden
      return
    end

    # Check rollout eligibility
    refresh_token = Doorkeeper::AccessToken.by_token(refresh_token_param)
    if refresh_token
      user = if Doorkeeper.config.polymorphic_resource_owner?
               owner = refresh_token.respond_to?(:resource_owner) ? refresh_token.resource_owner : nil
               if owner.is_a?(User)
                 owner
               elsif owner.respond_to?(:account)
                 owner.account&.user
               end
             else
               User.find_by(id: refresh_token.resource_owner_id)
             end

      if user && !MultiAccounts::Rollout.should_enable_for_user?(user)
        render json: { error: 'This feature is not available for your account' }, status: :forbidden
        return
      end
    end

    result = service.call

    Rails.logger.info(
      "[MultiAccount] Session refresh attempt with token: #{refresh_token_param.to_s[0..20]}",
    )
    Rails.logger.info(
      "[MultiAccount] Before sign_in - current_user: #{current_user&.id}, target_user: #{result.user&.id}",
    )

    reset_session
    sign_in(result.user, scope: :user)

    Rails.logger.info(
      "[MultiAccount] After sign_in - session user: #{session[:user_id]}, current_user: #{current_user&.id}",
    )

    render json: {
      token: result.access_token.token,
      account: REST::AccountSerializer.new(result.account).as_json,
      scope: result.access_token.scopes.to_s,
      expires_at: result.access_token.expires_at&.iso8601
    }
  rescue ActionController::ParameterMissing => e
    render json: { error: "필수 파라미터 누락: #{e.param}" }, status: :bad_request
  rescue MultiAccounts::RefreshService::Error => e
    render json: { error: e.message }, status: e.status
  end

  private

  def service
    @service ||= MultiAccounts::RefreshService.new(refresh_token: refresh_token_param, request: request)
  end

  def refresh_token_param
    params.require(:refresh_token)
  end
end

