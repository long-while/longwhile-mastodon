# frozen_string_literal: true

class OAuth::AuthorizationsController < Doorkeeper::AuthorizationsController
  prepend_before_action :handle_multi_account_force_login
  prepend_before_action :store_current_location, only: :new

  layout 'modal'

  content_security_policy do |p|
    p.form_action(false)
  end

  include Localized

  private

  def store_current_location
    store_location_for(:user, request.url)
  end

  def can_authorize_response?
    !truthy_param?('force_login') && super
  end

  def truthy_param?(key)
    ActiveModel::Type::Boolean.new.cast(params[key])
  end

  def multi_account_force_login_requested?
    truthy_param?('force_login') || params[:prompt] == 'login'
  end

  def multi_account_state_data
    return @multi_account_state_data if defined?(@multi_account_state_data)

    state = params[:state]
    @multi_account_state_data =
      if state.present?
        MultiAccounts::StateStore.fetch(state)
      else
        nil
      end
  rescue StandardError => e
    Rails.logger.warn("Multi-account force login state fetch failed: #{e.message}")
    @multi_account_state_data = nil
  end

  def handle_multi_account_force_login
    return unless multi_account_force_login_requested?

    state_data = multi_account_state_data
    return unless state_data.present?
    return unless state_data[:user_id].present?

    return unless user_signed_in? && current_user.id == state_data[:user_id].to_i
    return if state_data[:force_login_performed]

    MultiAccounts::StateStore.mark_force_login!(params[:state])
    @multi_account_state_data = state_data.merge(force_login_performed: true)
    sign_out(:user)
    store_location_for(:user, request.original_fullpath)

    session[:multi_account_return_to] = request.original_fullpath
    session[:multi_account_return_to_at] = Time.now.utc.to_i
  end

  def mfa_setup_path
    super({ oauth: true })
  end
end
