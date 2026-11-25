# frozen_string_literal: true

module Admin::DashboardHelper
  def relevant_account_ip(account, ip_query)
    ips = account_ips_for_admin(account)

    matched_ip = begin
      ip_query_addr = IPAddr.new(ip_query)
      ips.find { |ip| ip_query_addr.include?(ip.ip) } || ips.first
    rescue IPAddr::Error
      ips.first
    end

    if matched_ip
      link_to matched_ip.ip, admin_accounts_path(ip: matched_ip.ip)
    else
      '-'
    end
  end

  def account_ips_for_admin(account)
    return account.user.ips.to_a if account.user.present?

    record = account.deleted_user_record
    record ? record.ips.to_a : []
  end

  def account_email_for_admin(account)
    account.user_email.presence || account.deleted_user_record&.email.presence
  end

  def account_email_domain_for_admin(account)
    return account.user_email_domain if account.user_email.present?

    account.deleted_user_record&.email_domain
  end

  def date_range(range)
    [l(range.first), l(range.last)]
      .join(' - ')
  end

  def relevant_account_timestamp(account)
    timestamp, exact = if account.user_current_sign_in_at && account.user_current_sign_in_at < 24.hours.ago
                         [account.user_current_sign_in_at, true]
                       elsif account.user_current_sign_in_at
                         [account.user_current_sign_in_at, false]
                       elsif account.user_pending?
                         [account.user_created_at, true]
                       elsif account.suspended_at.present? && account.local? && account.user.nil?
                         [account.suspended_at, true]
                       elsif account.last_status_at.present?
                         [account.last_status_at, true]
                       else
                         [nil, false]
                       end

    return '-' if timestamp.nil?
    return t('generic.today') unless exact

    content_tag(:time, l(timestamp), class: 'time-ago', datetime: timestamp.iso8601, title: l(timestamp))
  end
end
