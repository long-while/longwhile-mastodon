# frozen_string_literal: true

class Settings::NotificationsController < Settings::PreferencesBaseController
  POLICY_FIELDS = %i(for_not_following for_not_followers for_new_accounts).freeze
  POLICY_VALUES = %w(accept filter drop).freeze

  before_action :set_policy

  def update
    ApplicationRecord.transaction do
      @policy.update!(policy_params)
      current_user.update!(user_params)
    end

    I18n.locale = current_user.locale
    redirect_to after_update_redirect_path, notice: I18n.t('generic.changes_saved_msg')
  rescue ActiveRecord::RecordInvalid
    render :show
  end

  private

  def set_policy
    @policy = NotificationPolicy.find_or_initialize_by(account: current_account)
  end

  def user_params
    return {} if params[:user].blank?

    super
  end

  def policy_params
    return {} if params[:notification_policy].blank?

    params
      .require(:notification_policy)
      .permit(*POLICY_FIELDS)
      .select { |_, value| POLICY_VALUES.include?(value) }
  end

  def after_update_redirect_path
    settings_notifications_path
  end
end
