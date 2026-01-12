# frozen_string_literal: true

class MultiAccounts::SessionsController < ApplicationController
  skip_before_action :verify_authenticity_token

  def restore
    payload = params.require(:payload).permit(:state, :nonce)

    state = payload[:state]
    nonce = payload[:nonce]

    data = MultiAccounts::StateStore.fetch(state)

    if data.blank? || data[:nonce] != nonce
      render json: { error: 'Invalid state or nonce' }, status: :unauthorized
      return
    end

    user = User.find_by(id: data[:user_id])

    unless user
      render json: { error: 'User not found for state' }, status: :not_found
      return
    end

    sign_in(:user, user)

    head :ok
  rescue ActionController::ParameterMissing => e
    render json: { error: "Missing parameter: #{e.param}" }, status: :bad_request
  rescue StandardError => e
    Rails.logger.error("Failed to restore multi-account session: #{e.message}")
    render json: { error: 'Failed to restore session' }, status: :internal_server_error
  end
end

