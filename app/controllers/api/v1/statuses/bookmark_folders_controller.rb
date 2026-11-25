# frozen_string_literal: true

class Api::V1::Statuses::BookmarkFoldersController < Api::V1::Statuses::BaseController
  before_action -> { doorkeeper_authorize! :read, :'read:bookmarks' }, only: [:show]
  before_action -> { doorkeeper_authorize! :write, :'write:bookmarks' }, only: [:update]
  before_action :require_user!
  before_action :require_socially_visible!
  skip_before_action :log_direct_message_view!
  before_action :log_direct_message_view!

  def show
    render json: { folder_ids: folder_ids_for(current_bookmark) }
  end

  def update
    folders = requested_folders
    bookmark = folders.empty? ? current_bookmark : ensure_bookmark!

    replace_folders!(bookmark, folders) if bookmark

    render json: {
      folder_ids: folder_ids_for(bookmark),
      status: serialized_status,
    }
  rescue ActiveRecord::InvalidForeignKey
    render json: { error: I18n.t('bookmark_folders.errors.conflict') }, status: 409
  end

  private

  def target_status
    @status.proper
  end

  def require_socially_visible!
    not_found unless ThreadHead::SocialStatusPolicy.new(current_account, target_status).show?
  end

  def current_bookmark
    current_account.bookmarks.find_by(status_id: target_status.id)
  end

  def ensure_bookmark!
    current_account.bookmarks.find_or_create_by!(status: target_status)
  rescue ActiveRecord::RecordNotUnique, ActiveRecord::RecordInvalid
    current_bookmark || raise
  end

  def requested_folders
    ids = params[:folder_ids]
    ids = [] if ids.blank?
    raise Mastodon::ValidationError, I18n.t('bookmark_folders.errors.unknown_folder') unless BookmarkFolder.id_list?(ids)

    ids = ids.map(&:to_i).uniq
    folders = current_account.bookmark_folders.where(id: ids).to_a
    raise Mastodon::ValidationError, I18n.t('bookmark_folders.errors.unknown_folder') unless folders.size == ids.size

    folders
  end

  def replace_folders!(bookmark, folders)
    wanted = folders.map(&:id)

    BookmarkFolderItem.transaction do
      bookmark.bookmark_folder_items.where.not(bookmark_folder_id: wanted).delete_all
      next if wanted.empty?

      now = Time.current
      rows = wanted.map { |folder_id| { bookmark_folder_id: folder_id, bookmark_id: bookmark.id, created_at: now, updated_at: now } }
      BookmarkFolderItem.insert_all(rows, unique_by: :index_bookmark_folder_items_on_folder_and_bookmark)
    end
  end

  def serialized_status
    ActiveModelSerializers::SerializableResource.new(
      target_status,
      serializer: REST::StatusSerializer,
      scope: current_user,
      scope_name: :current_user,
      relationships: StatusRelationshipsPresenter.new([target_status], current_account.id)
    ).as_json
  end

  def folder_ids_for(bookmark)
    return [] unless bookmark

    bookmark.bookmark_folder_items.pluck(:bookmark_folder_id).map(&:to_s)
  end
end
