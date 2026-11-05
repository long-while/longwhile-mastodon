# frozen_string_literal: true

module Admin
  class DirectMessagesController < BaseController
    PER_PAGE = 40

    helper_method :direct_message_filter_params

    def index
      authorize [:admin, :direct_message], :index?

      @direct_messages = filtered_direct_messages.page(params[:page]).per(PER_PAGE).without_count
    end

    private

    def direct_message_filter_params
      params.slice(:q, :exclude_mentioning).permit(:q, :exclude_mentioning).to_h.compact_blank
    end

    def filtered_direct_messages
      scope = Status.where(visibility: :direct)
                    .includes(:account, :mentioned_accounts)
                    .reorder(id: :desc)

      scope = apply_search(scope)
      apply_exclude_mentioning(scope)
    end

    def apply_search(scope)
      return scope if params[:q].blank?

      term = "%#{escape_like(params[:q].strip)}%"

      scope
        .left_joins(:account)
        .where('statuses.text ILIKE :term OR accounts.username ILIKE :term', term: term)
    end

    def escape_like(value)
      value.gsub(/[\\%_]/) { |char| "\\#{char}" }
    end

    def apply_exclude_mentioning(scope)
      usernames = parse_usernames(params[:exclude_mentioning])
      return scope if usernames.empty?

      excluded_account_ids = Account
                             .where(domain: nil)
                             .where('lower(username) IN (?)', usernames)
                             .pluck(:id)
      return scope if excluded_account_ids.empty?

      scope.where.not(id: Mention.where(account_id: excluded_account_ids).select(:status_id))
    end

    def parse_usernames(value)
      return [] if value.blank?

      value
        .split(/[\s,]+/)
        .map { |name| name.delete_prefix('@').strip.downcase }
        .compact_blank
        .uniq
    end
  end
end
