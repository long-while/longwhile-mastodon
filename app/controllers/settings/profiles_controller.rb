# frozen_string_literal: true

class Settings::ProfilesController < Settings::BaseController
  before_action :set_account

  def show
    @account.build_fields
  end

  def update
    toggle_changed = private_account_toggle_changed?

    if UpdateAccountService.new.call(@account, account_attributes(toggle_changed))
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

  # ─── @_longwhile custom feature
  # 사용·재사용 시 서버 내 출처 표기 필수 / Credit required to use or reuse:
  #   Twitter/X @_longwhile · Crepe https://kre.pe/QTRx
  def account_attributes(toggle_changed)
    return account_params unless toggle_changed

    account_params.merge(locked: private_account_enabled?, hide_collections: private_account_enabled?)
  end

  def private_account_toggle_changed?
    return false if params.dig(:account, :private_account).blank?

    @account.locked? != private_account_enabled?
  end

  def private_account_enabled?
    ActiveModel::Type::Boolean.new.cast(params[:account][:private_account])
  end

  def set_account
    @account = current_account
  end
end
