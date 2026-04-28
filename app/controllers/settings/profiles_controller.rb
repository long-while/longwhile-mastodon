# frozen_string_literal: true

class Settings::ProfilesController < Settings::BaseController
  before_action :set_account

  def show
    @account.build_fields
  end

  def update
    toggle_changed = private_account_toggle_changed?

    if UpdateAccountService.new.call(@account, account_attributes(toggle_changed))
      apply_private_account_settings! if toggle_changed
      ActivityPub::UpdateDistributionWorker.perform_in(ActivityPub::UpdateDistributionWorker::DEBOUNCE_DELAY, @account.id)
      redirect_to settings_profile_path, notice: I18n.t('generic.changes_saved_msg')
    else
      @account.build_fields
      render :show
    end
  end

  private

  def account_params
    params.expect(account: [:display_name, :note, :avatar, :header, :bot, fields_attributes: [[:name, :value]]])
  end

  def account_attributes(toggle_changed)
    return account_params unless toggle_changed

    account_params.merge(locked: private_account_enabled?, hide_collections: private_account_enabled?)
  end

  def apply_private_account_settings!
    current_user.update!(settings_attributes: { default_privacy: private_account_enabled? ? 'private' : 'unlisted' })
  end

  def private_account_toggle_changed?
    return false if params.dig(:account, :private_account).blank?

    @account.private_account != private_account_enabled?
  end

  def private_account_enabled?
    ActiveModel::Type::Boolean.new.cast(params[:account][:private_account])
  end

  def set_account
    @account = current_account
  end
end
