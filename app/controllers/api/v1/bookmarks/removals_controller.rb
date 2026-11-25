# frozen_string_literal: true

class Api::V1::Bookmarks::RemovalsController < Api::BaseController
  include Api::BookmarkStatusIds

  before_action -> { doorkeeper_authorize! :write, :'write:bookmarks' }
  before_action :require_user!

  def create
    removed = current_account.bookmarks.where(status_id: requested_status_ids).order(:id).map do |bookmark|
      bookmark.destroy!
      bookmark.status_id.to_s
    end

    render json: { status_ids: removed }
  end
end
