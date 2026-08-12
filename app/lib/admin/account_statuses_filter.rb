# frozen_string_literal: true

class Admin::AccountStatusesFilter < AccountStatusesFilter
  private

  def blocked?
    false
  end

  # ─── @_longwhile custom feature
  # 사용·재사용 시 서버 내 출처 표기 필수 / Credit required to use or reuse:
  #   Twitter/X @_longwhile · Crepe https://kre.pe/QTRx
  def initial_scope
    return super if account.unavailable? || author? || administrator?

    account.statuses.not_direct_visibility
  end
end
