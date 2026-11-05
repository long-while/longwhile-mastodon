# frozen_string_literal: true

class Auth::RegistrationsController < Devise::RegistrationsController
  include RegistrationHelper
  include Auth::RegistrationSpamConcern

  layout :determine_layout

  # @_longwhile — Devise 가 prepend_before_action 으로 건 require_no_authentication 등이
  # Localized 의 around_action 보다 먼저 돌아 "You are already signed in." 같은 플래시를
  # 영어로 만든다. 같은 이름으로 다시 걸면 앞의 등록이 지워지고 맨 앞으로 온다.
  prepend_around_action :set_locale

  before_action :set_invite, only: [:new, :create]
  before_action :check_enabled_registrations, only: [:new, :create]
  before_action :configure_sign_up_params, only: [:create]
  before_action :set_sessions, only: [:edit, :update]
  before_action :set_strikes, only: [:edit, :update]
  before_action :require_not_suspended!, only: [:update]
  before_action :set_rules, only: :new
  before_action :require_rules_acceptance!, only: :new
  before_action :set_registration_form_time, only: :new

  skip_before_action :check_self_destruct!, only: [:edit, :update]
  skip_before_action :require_functional!, only: [:edit, :update]

  def new
    super(&:build_invite_request)
  end

  def edit
    super
  end

  def create
    super
  rescue ActiveRecord::MultiparameterAssignmentErrors => e
    handle_multiparameter_assignment_error(e.errors)
  end

  def update
    super do |resource|
      resource.clear_other_sessions(current_session.session_id) if resource.saved_change_to_encrypted_password?
    end
  end

  def destroy
    not_found
  end

  protected

  def update_resource(resource, params)
    params[:password] = nil if Devise.pam_authentication && resource.encrypted_password.blank?

    super
  end

  def build_resource(hash = nil)
    super

    # @_longwhile — 브라우저의 Accept-Language 를 따르지 않는다. 따랐다가는 영어
    # 브라우저로 가입한 사람이 영어에 갇힌다 (settings-phase-2.md §1.3).
    # I18n.locale 은 Localized 가 요청마다 :ko 로 고정한 값이다. I18n.default_locale 을
    # 쓰면 안 된다 — DEFAULT_LOCALE 이 없으면 :en 이라(config/initializers/i18n.rb)
    # 가입자가 모두 en 으로 적혀 Sidekiq 이 보내는 메일이 영어로 나간다.
    resource.locale                 = I18n.locale
    resource.invite_code            = @invite&.code if resource.invite_code.blank?
    resource.registration_form_time = session[:registration_form_time]
    resource.sign_up_ip             = request.remote_ip

    resource.build_account if resource.account.nil?
  end

  def configure_sign_up_params
    devise_parameter_sanitizer.permit(:sign_up) do |user_params|
      user_params.permit({ account_attributes: [:username, :display_name], invite_request_attributes: [:text] }, :email, :password, :password_confirmation, :invite_code, :agreement, :website, :confirm_password, :date_of_birth)
    end
  end

  def after_sign_up_path_for(_resource)
    auth_setup_path
  end

  def after_sign_in_path_for(_resource)
    set_invite

    if @invite&.autofollow?
      short_account_path(@invite.user.account)
    else
      super
    end
  end

  def after_inactive_sign_up_path_for(_resource)
    new_user_session_path
  end

  def after_update_path_for(_resource)
    edit_user_registration_path
  end

  def check_enabled_registrations
    redirect_to new_user_session_path, alert: I18n.t('devise.failure.closed_registrations', email: Setting.site_contact_email) unless allowed_registration?(request.remote_ip, @invite)
  end

  def invite_code
    if params[:user]
      params[:user][:invite_code]
    else
      params[:invite_code]
    end
  end

  private

  def set_invite
    @invite = begin
      invite = Invite.find_by(code: invite_code) if invite_code.present?
      invite if invite&.valid_for_use?
    end
  end

  def handle_multiparameter_assignment_error(errors)
    build_resource(sign_up_params_without_invalid_multiparameter_attributes(errors))

    errors.each do |attribute_error|
      resource.errors.add(attribute_error.attribute, :invalid)
    end

    clean_up_passwords resource
    set_minimum_password_length
    respond_with resource
  end

  def sign_up_params_without_invalid_multiparameter_attributes(errors)
    invalid_attributes = errors.map { |attribute_error| attribute_error.attribute.to_s }

    sign_up_params.to_h.reject do |key, _value|
      invalid_attributes.any? do |attribute|
        key.to_s == attribute || key.to_s.match?(/\A#{Regexp.escape(attribute)}\(\d+i\)\z/)
      end
    end
  end

  def determine_layout
    %w(edit update).include?(action_name) ? 'admin' : 'auth'
  end

  def set_sessions
    @sessions = current_user.session_activations.order(updated_at: :desc)
  end

  def set_strikes
    @strikes = current_account.strikes.recent.latest
  end

  def require_not_suspended!
    forbidden if current_account.unavailable?
  end

  def set_rules
    @rules = Rule.ordered.includes(:translations)
  end

  def require_rules_acceptance!
    return if @rules.empty? || validated_accept_token?

    @accept_token = session[:accept_token] = SecureRandom.hex
    @invite_code = invite_code
    @rule_translations = @rules.map { |rule| rule.translation_for(I18n.locale) }

    render :rules
  end

  def validated_accept_token?
    session[:accept_token].present? && params[:accept] == session[:accept_token]
  end

  def is_flashing_format? # rubocop:disable Naming/PredicatePrefix
    if params[:action] == 'create'
      false # Disable flash messages for sign-up
    else
      super
    end
  end
end
