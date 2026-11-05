# frozen_string_literal: true

class Auth::PasswordsController < Devise::PasswordsController
  skip_before_action :check_self_destruct!
  before_action :redirect_invalid_reset_token, only: :edit, unless: :reset_password_token_is_valid?

  layout 'auth'

  # @_longwhile — Devise 가 prepend_before_action 으로 건 require_no_authentication 등이
  # Localized 의 around_action 보다 먼저 돌아 "You are already signed in." 같은 플래시를
  # 영어로 만든다. 같은 이름으로 다시 걸면 앞의 등록이 지워지고 맨 앞으로 온다.
  prepend_around_action :set_locale

  def update
    super do |resource|
      if resource.errors.empty?
        resource.session_activations.destroy_all

        resource.revoke_access!
      end
    end
  end

  private

  def redirect_invalid_reset_token
    redirect_to new_password_path(resource_name), flash: { error: t('auth.invalid_reset_password_token') }
  end

  def reset_password_token_is_valid?
    resource_class.with_reset_password_token(params[:reset_password_token]).present?
  end
end
