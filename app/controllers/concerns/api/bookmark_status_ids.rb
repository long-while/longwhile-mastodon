# frozen_string_literal: true

module Api::BookmarkStatusIds
  STATUS_IDS_LIMIT = 40

  private

  def requested_status_ids
    @requested_status_ids ||= begin
      ids = params[:status_ids]
      ids = [] if ids.blank?
      raise Mastodon::ValidationError, I18n.t('bookmarks.errors.invalid_status_ids') unless BookmarkFolder.id_list?(ids)
      raise Mastodon::ValidationError, I18n.t('bookmarks.errors.too_many_statuses', limit: STATUS_IDS_LIMIT) if ids.size > STATUS_IDS_LIMIT

      ids.map(&:to_i).uniq
    end
  end
end
