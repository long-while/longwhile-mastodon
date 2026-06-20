# frozen_string_literal: true

class MultiAccounts::SessionsController < ApplicationController
  skip_before_action :verify_authenticity_token

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
end

