# frozen_string_literal: true

class Api::V1::Bookmarks::DetailsController < Api::BaseController
  include Api::BookmarkStatusIds

  before_action -> { doorkeeper_authorize! :read, :'read:bookmarks' }
  before_action :require_user!

  def index
    bookmarks = current_account.bookmarks.where(status_id: requested_status_ids).includes(:bookmark_folder_items).order(:id)
    render json: bookmarks, each_serializer: REST::BookmarkDetailSerializer
  end
end
