# frozen_string_literal: true

class MultiAccounts::SessionsController < ApplicationController
  skip_before_action :verify_authenticity_token
  before_action :require_same_origin!

  def restore
    payload = params.require(:payload).permit(:state, :nonce)

    # consume! validates the nonce in constant time and deletes the state from Redis,
    # so a captured (state, nonce) pair cannot be replayed to re-issue a session.
    data = MultiAccounts::StateStore.consume!(payload[:state], payload[:nonce])

    user = User.find_by(id: data[:user_id])

    unless user
      render json: { error: 'User not found for state' }, status: :not_found
      return
    end

    if user.disabled? || user.account&.unavailable? || !user.active_for_authentication?
      render json: { error: 'Account is suspended or disabled' }, status: :forbidden
      return
    end

    sign_in(:user, user)

    head :ok
  rescue MultiAccounts::StateStore::InvalidStateError
    render json: { error: 'Invalid state or nonce' }, status: :unauthorized
  rescue ActionController::ParameterMissing => e
    render json: { error: "Missing parameter: #{e.param}" }, status: :bad_request
  rescue StandardError => e
    Rails.logger.error("Failed to restore multi-account session: #{e.message}")
    render json: { error: 'Failed to restore session' }, status: :internal_server_error
  end

  private

  def require_same_origin!
    cross_site = request.headers['Sec-Fetch-Site'].present? && request.headers['Sec-Fetch-Site'] != 'same-origin'
    foreign_origin = request.origin.present? && request.origin != request.base_url
    return unless cross_site || foreign_origin

    render json: { error: 'Cross-origin request refused' }, status: 403
  end
end
