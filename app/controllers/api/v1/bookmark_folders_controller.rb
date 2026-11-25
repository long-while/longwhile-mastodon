# frozen_string_literal: true

class Api::V1::BookmarkFoldersController < Api::BaseController
  before_action -> { doorkeeper_authorize! :read, :'read:bookmarks' }, only: [:index]
  before_action -> { doorkeeper_authorize! :write, :'write:bookmarks' }, except: [:index]
  before_action :require_user!
  before_action :set_folder, only: [:update, :destroy, :remove_status]

  def index
    render json: current_account.bookmark_folders.ordered, each_serializer: REST::BookmarkFolderSerializer
  end

  def create
    folder = BookmarkFolder.create_for!(current_account, folder_params)
    render json: folder, serializer: REST::BookmarkFolderSerializer
  end

  def update
    @folder.update!(folder_params)
    render json: @folder, serializer: REST::BookmarkFolderSerializer
  end

  def destroy
    @folder.destroy!
    render_empty
  end

  def order
    ids = params[:folder_ids]
    raise Mastodon::ValidationError, I18n.t('bookmark_folders.errors.unknown_folder') unless BookmarkFolder.order_list?(ids)
    return render json: { error: I18n.t('bookmark_folders.errors.stale_order') }, status: 409 unless BookmarkFolder.reorder!(current_account, ids)

    render json: current_account.bookmark_folders.ordered, each_serializer: REST::BookmarkFolderSerializer
  end

  def remove_status
    status = Status.find_by(id: params[:status_id])
    status_id = status&.proper&.id || params[:status_id].to_i

    @folder.bookmark_folder_items.where(bookmark_id: current_account.bookmarks.where(status_id: status_id).select(:id)).delete_all
    render_empty
  end

  private

  def set_folder
    @folder = current_account.bookmark_folders.find(params[:id])
  end

  def folder_params
    params.permit(:name)
  end
end
