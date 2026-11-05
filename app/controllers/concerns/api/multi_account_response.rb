# frozen_string_literal: true

module Api::MultiAccountResponse
  extend ActiveSupport::Concern

  private

  def self_account_json(account)
    REST::AccountSerializer.new(account, scope: account.user, scope_name: :current_user).as_json
  end
end
