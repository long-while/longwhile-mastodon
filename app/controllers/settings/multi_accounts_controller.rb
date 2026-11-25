# frozen_string_literal: true

class Settings::MultiAccountsController < Settings::BaseController
  skip_before_action :require_functional!

  before_action :require_not_suspended!, only: [:destroy, :destroy_all]

  def index
    @tokens = connection_tokens.order(created_at: :desc)
  end

  def destroy
    connection_tokens.find(params[:id]).revoke
    redirect_to settings_multi_accounts_path, notice: t('multi_accounts.revoke_success')
  end

  def destroy_all
    current_user.revoke_multi_account_tokens!
    redirect_to settings_multi_accounts_path, notice: t('multi_accounts.revoke_all_success')
  end

  private

  def connection_tokens
    Doorkeeper::AccessToken
      .by_resource_owner(current_user)
      .multi_account_owned
      .not_revoked
      .where("oauth_access_tokens.purpose IS DISTINCT FROM 'multi_account_session'")
  end
end
