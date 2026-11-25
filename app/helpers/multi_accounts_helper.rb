# frozen_string_literal: true

module MultiAccountsHelper
  def revoke_link_label(token)
    date = l(token.created_at)
    return t('multi_accounts.revoke_label', date: date) if token.last_used_ip.blank?

    t('multi_accounts.revoke_label_with_ip', date: date, ip: token.last_used_ip)
  end
end
