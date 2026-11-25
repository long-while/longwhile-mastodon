# frozen_string_literal: true

class Api::V1::BookmarkFolders::StatusesController < Api::BaseController
  include Api::BookmarkStatusIds

  before_action -> { doorkeeper_authorize! :write, :'write:bookmarks' }
  before_action :require_user!
  before_action :set_folder

  def create
    insert_items!(fileable_bookmark_ids)
    render json: { status_ids: folder_items.pluck('bookmarks.status_id').map(&:to_s) }
  rescue ActiveRecord::InvalidForeignKey
    render json: { error: I18n.t('bookmark_folders.errors.conflict') }, status: 409
  end

  def destroy
    items = folder_items.pluck(:id, 'bookmarks.status_id')
    BookmarkFolderItem.where(id: items.map(&:first)).delete_all
    render json: { status_ids: items.map { |_, status_id| status_id.to_s } }
  end

  private

  def set_folder
    @folder = current_account.bookmark_folders.find(params[:bookmark_folder_id])
  end

  def folder_items
    @folder.bookmark_folder_items.joins(:bookmark).where(bookmarks: { status_id: requested_status_ids }).order(:id)
  end

  def fileable_bookmark_ids
    bookmarks = current_account.bookmarks.where(status_id: requested_status_ids).pluck(:status_id, :id).to_h
    return [] if bookmarks.empty?

    visible = Status.where(id: bookmarks.keys).includes(:account).select { |status| ThreadHead::SocialStatusPolicy.new(current_account, status).show? }
    visible.map { |status| bookmarks[status.id] }
  end

  def insert_items!(bookmark_ids)
    return if bookmark_ids.empty?

    now = Time.current
    rows = bookmark_ids.map { |bookmark_id| { bookmark_folder_id: @folder.id, bookmark_id: bookmark_id, created_at: now, updated_at: now } }
    BookmarkFolderItem.insert_all(rows, unique_by: :index_bookmark_folder_items_on_folder_and_bookmark)
  end
end
