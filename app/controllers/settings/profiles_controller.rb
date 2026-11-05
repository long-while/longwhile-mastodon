# frozen_string_literal: true

class Settings::ProfilesController < Settings::BaseController
  before_action :set_account

  def show
    @account.build_fields
  end

  def update
    toggle_changed = private_account_toggle_changed?

    if UpdateAccountService.new.call(@account, account_attributes(toggle_changed))
      current_user.update!(settings_attributes: account_params[:settings]) if account_params[:settings].present?
      ActivityPub::UpdateDistributionWorker.perform_in(ActivityPub::UpdateDistributionWorker::DEBOUNCE_DELAY, @account.id)
      redirect_to settings_profile_path, notice: I18n.t('generic.changes_saved_msg')
    else
      @account.build_fields
      render :show
    end
  end

  private

  def account_params
    params.expect(account: [:display_name, :note, :avatar, :header, :private_account, fields_attributes: [[:name, :value]], settings: UserSettings.keys])
  end

  def account_attributes(toggle_changed)
    attributes = account_params.except(:settings, :private_account)
    return attributes unless toggle_changed

    attributes.merge(locked: private_account_enabled?, hide_collections: private_account_enabled?)
  end

  def private_account_toggle_changed?
    return false if account_params[:private_account].blank?

    @account.locked? != private_account_enabled?
  end

  def private_account_enabled?
    ActiveModel::Type::Boolean.new.cast(account_params[:private_account])
  end

  def set_account
    @account = current_account
  end
end
