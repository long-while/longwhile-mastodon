# frozen_string_literal: true

class Api::V1::BookmarksController < Api::BaseController
  before_action -> { doorkeeper_authorize! :read, :'read:bookmarks' }
  before_action :require_user!
  after_action :insert_pagination_headers

  def index
    @statuses = load_statuses
    render json: @statuses, each_serializer: REST::StatusSerializer, relationships: StatusRelationshipsPresenter.new(@statuses, current_user&.account_id)
  end

  private

  def load_statuses
    preloaded_bookmarks
  end

  def preloaded_bookmarks
    preload_collection(results.map(&:status), Status)
  end

  def results
    @results ||= account_bookmarks.joins(:status).eager_load(:status).to_a_paginated_by_id(
      limit_param(DEFAULT_STATUSES_LIMIT),
      params_slice(:max_id, :since_id, :min_id)
    )
  end

  def account_bookmarks
    folder_id = params[:folder_id]
    return current_account.bookmarks if folder_id.blank?

    raise ActiveRecord::RecordNotFound unless folder_id.is_a?(String) && folder_id.match?(/\A\d{1,19}\z/)

    folder = current_account.bookmark_folders.find(folder_id)
    current_account.bookmarks.where(id: folder.bookmark_folder_items.select(:bookmark_id))
  end

  def pagination_params(core_params)
    params.slice(:limit, :folder_id).permit(:limit, :folder_id).merge(core_params)
  end

  def next_path
    api_v1_bookmarks_url pagination_params(max_id: pagination_max_id) if records_continue?
  end

  def prev_path
    api_v1_bookmarks_url pagination_params(min_id: pagination_since_id) unless results.empty?
  end

  def pagination_collection
    results
  end

  def records_continue?
    results.size == limit_param(DEFAULT_STATUSES_LIMIT)
  end
end
