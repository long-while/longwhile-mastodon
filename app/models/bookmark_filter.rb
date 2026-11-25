# frozen_string_literal: true

class BookmarkFilter
  QUERY_MAX_LENGTH = 100
  ID_FORMAT = /\A\d{1,19}\z/
  NO_FOLDER = 'none'

  TEXT_SEARCH_SQL = <<~SQL.squish
    (statuses.text ILIKE :pattern OR statuses.spoiler_text ILIKE :pattern OR bookmarks.note ILIKE :pattern)
  SQL

  WITH_MEDIA_SQL = <<~SQL.squish
    EXISTS (SELECT 1 FROM media_attachments WHERE media_attachments.status_id = statuses.id)
  SQL

  attr_reader :account, :params

  def initialize(account, params)
    @account = account
    @params = params
  end

  def results
    scope = folder_scope(account.bookmarks)
    scope = scope.where(TEXT_SEARCH_SQL, pattern: "%#{Bookmark.sanitize_sql_like(query)}%") if query
    scope = scope.where(WITH_MEDIA_SQL) if only_media?
    scope = scope.where(statuses: { account_id: author_id }) if author_id
    scope
  end

  def link_params
    {
      folder_id: folder_id,
      q: query,
      only_media: only_media? ? 'true' : nil,
      account_id: author_id,
    }.compact
  end

  def query
    return @query if defined?(@query)

    value = params[:q]
    @query = value.is_a?(String) ? value.strip.presence&.slice(0, QUERY_MAX_LENGTH) : nil
  end

  def only_media?
    ActiveModel::Type::Boolean.new.cast(params[:only_media]) == true
  end

  private

  def folder_id
    @folder_id ||= begin
      value = params[:folder_id]
      value.blank? || value == NO_FOLDER ? value.presence : validated_id!(value)
    end
  end

  def author_id
    @author_id ||= params[:account_id].presence && validated_id!(params[:account_id])
  end

  def validated_id!(value)
    raise ActiveRecord::RecordNotFound unless value.is_a?(String) && value.match?(ID_FORMAT)

    value
  end

  def folder_scope(scope)
    return scope if folder_id.nil?
    return scope.where.not(folder_items_of_bookmark.arel.exists) if folder_id == NO_FOLDER

    folder = account.bookmark_folders.find(folder_id)
    scope.where(id: folder.bookmark_folder_items.select(:bookmark_id))
  end

  def folder_items_of_bookmark
    BookmarkFolderItem.where(BookmarkFolderItem.arel_table[:bookmark_id].eq(Bookmark.arel_table[:id]))
  end
end
