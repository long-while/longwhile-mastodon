# frozen_string_literal: true

module Admin::DirectMessageViewLog
  WINDOW = Admin::DmRoomViewLog::WINDOW

  LIST_ACTION = :search_direct_messages
  VIEW_ACTION = :view

  HIDDEN_VISIBILITIES = %w(direct limited).freeze
  QUERY_MAX_LENGTH = 200

  module_function

  def log_list_view!(account, query: nil, page: nil)
    query = normalize_query(query)
    attributes = { route_param: query }
    attributes[:permalink] = list_permalink(query, page) if query

    log!(account, LIST_ACTION, account, **attributes)
  end

  def log_status_views!(account, statuses)
    return if account.nil?

    hidden = hidden_statuses(account, statuses)
    return if hidden.empty? || !account.user&.can?(:view_direct_messages)

    bypassed = reject_mentioned(account, hidden)
    return if bypassed.empty?

    log_bypassed!(account, bypassed)
  end

  def log_bypassed!(account, bypassed)
    room_ids = room_ids_by_conversation(bypassed)
    in_room, without_room = bypassed.partition { |status| room_ids[status.conversation_id] }

    DmRoom.where(id: in_room.map { |status| room_ids[status.conversation_id] }.uniq).find_each do |room|
      log!(account, VIEW_ACTION, room)
    end

    logged = recently_logged_status_ids(account, without_room)
    without_room.each do |status|
      account.action_logs.create!(action: VIEW_ACTION, target: status) unless logged.include?(status.id)
    end
  end

  def hidden_statuses(account, statuses)
    statuses.compact.uniq.select { |status| HIDDEN_VISIBILITIES.include?(status.visibility) && status.account_id != account.id }
  end

  def reject_mentioned(account, hidden)
    mentioned = Mention.where(account_id: account.id, status_id: hidden.map(&:id)).pluck(:status_id).to_set
    hidden.reject { |status| mentioned.include?(status.id) }
  end

  def room_ids_by_conversation(statuses)
    Conversation.where(id: statuses.filter_map(&:conversation_id).uniq).where.not(dm_room_id: nil).pluck(:id, :dm_room_id).to_h
  end

  def recently_logged_status_ids(account, statuses)
    return Set.new if statuses.empty?

    Admin::ActionLog
      .where(account_id: account.id, action: VIEW_ACTION, target_type: 'Status', target_id: statuses.map(&:id), created_at: WINDOW.ago..)
      .pluck(:target_id).to_set
  end

  def normalize_query(query)
    return unless query.is_a?(String)

    query.strip.presence&.truncate(QUERY_MAX_LENGTH, omission: '')
  end

  def list_permalink(query, page)
    Rails.application.routes.url_helpers.admin_direct_messages_path({ q: query, page: page.to_s.presence }.compact)
  end

  def log!(account, action, target, **attributes)
    return if Admin::ActionLog.exists?(account: account, action: action, target: target, created_at: WINDOW.ago.., **attributes.slice(:route_param))

    account.action_logs.create!(action: action, target: target, **attributes)
  end
end
