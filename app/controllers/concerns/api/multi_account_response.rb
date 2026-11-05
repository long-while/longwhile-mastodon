# frozen_string_literal: true

# @_longwhile — 계정 전환 응답에 싣는 계정 JSON.
# 토큰 주인이 자기 계정을 보는 것과 같다(verify_credentials). 상류 4.6 의
# REST::AccountSerializer 는 feature_approval 에서 current_user 를 읽으므로, 범위 없이
# 만들면 NameError 로 500 이 난다.
module Api::MultiAccountResponse
  extend ActiveSupport::Concern

  private

  def self_account_json(account)
    REST::AccountSerializer.new(account, scope: account.user, scope_name: :current_user).as_json
  end
end
