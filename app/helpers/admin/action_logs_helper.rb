# frozen_string_literal: true

module Admin::ActionLogsHelper
  def log_target(log)
    case log.target_type
    when 'Account'
      link_to (log.human_identifier.presence || I18n.t('admin.action_logs.deleted_account')), admin_account_path(log.target_id)
    when 'User'
      if log.route_param.present?
        link_to log.human_identifier, admin_account_path(log.route_param)
      else
        I18n.t('admin.action_logs.deleted_account')
      end
    when 'UserRole'
      link_to log.human_identifier, admin_roles_path(log.target_id)
    when 'UsernameBlock'
      link_to log.human_identifier, edit_admin_username_block_path(log.target_id)
    when 'Report'
      link_to "##{log.human_identifier.presence || log.target_id}", admin_report_path(log.target_id)
    when 'Instance', 'DomainBlock', 'DomainAllow', 'UnavailableDomain'
      log.human_identifier.present? ? link_to(log.human_identifier, admin_instance_path(log.human_identifier)) : I18n.t('admin.action_logs.unavailable_instance')
    when 'Status', 'Collection'
      link_to log.human_identifier, log.permalink
    when 'AccountWarning'
      link_to log.human_identifier, disputes_strike_path(log.target_id)
    when 'Announcement'
      link_to truncate(log.human_identifier), edit_admin_announcement_path(log.target_id)
    when 'IpBlock', 'EmailDomainBlock', 'CustomEmoji'
      log.human_identifier
    when 'CanonicalEmailBlock'
      content_tag(:samp, (log.human_identifier.presence || '')[0...7], title: log.human_identifier)
    when 'Appeal'
      if log.route_param.present?
        link_to log.human_identifier, disputes_strike_path(log.route_param.presence)
      else
        I18n.t('admin.action_logs.deleted_account')
      end
    when 'Relay'
      link_to log.human_identifier, admin_relays_path
    when 'Tag'
      link_to log.human_identifier, admin_tag_path(log.target_id)
    when 'DmRoom'
      dm_room_log_target(log)
    end
  end

  def chain_multiple_translations(action_log)
    case action_log.target_type
    when 'Tag'
      %i(usable trendable listable).filter_map do |key|
        fetch_key = permutation_of_key(action_log, key)
        next if fetch_key.nil?

        t "admin.trends.tags.#{fetch_key}"
      end.join('; ')
    end
  end

  def permutation_of_key(log, key)
    # we're utilizing the store_accessors here, to get the values from the jsonb like: log.listable => true
    return if log.public_send(key).nil?

    log.public_send(key) ? key : :"not_#{key}"
  end

  # @_longwhile — 운영진의 DM 열람 기록(Admin::DmRoomViewLog).
  #   기록 화면은 view_audit_log 만 있으면 열리지만(모더레이터 포함) DM 은
  #   Admin::DirectMessagePolicy 가 허락한 사람만 읽는다. "누구와 누구의 대화인지"
  #   도 DM 의 일부이므로 그 사람에게만 참여자와 방 링크를 보이고, 나머지에게는 방
  #   번호만 보인다.
  def dm_room_log_target(log)
    label = "##{log.target_id}"
    return label unless policy([:admin, :direct_message]).index?

    label = "#{label} (#{log.human_identifier})" if log.human_identifier.present?
    log.target.present? ? link_to(label, "/messages/all/#{log.target_id}") : label
  end

  def sorted_action_log_types
    Admin::ActionLogFilter::ACTION_TYPE_MAP
      .keys
      .map { |key| [I18n.t("admin.action_logs.action_types.#{key}"), key] }
      .sort_by(&:first)
  end
end
