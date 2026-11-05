# frozen_string_literal: true

class Admin::AccountStatusesFilter < AccountStatusesFilter
  private

  def blocked?
    false
  end

  def initial_scope
    return super if account.unavailable? || author? || administrator?

    account.statuses.not_direct_visibility
  end
end
