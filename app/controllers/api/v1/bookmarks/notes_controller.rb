# frozen_string_literal: true

class Api::V1::Bookmarks::NotesController < Api::BaseController
  wrap_parameters false

  before_action -> { doorkeeper_authorize! :write, :'write:bookmarks' }
  before_action :require_user!
  before_action :set_bookmark

  def update
    raise Mastodon::ValidationError, @bookmark.errors.full_messages.to_sentence unless @bookmark.update(note: requested_note)

    render json: @bookmark, serializer: REST::BookmarkDetailSerializer
  end

  private

  def set_bookmark
    @bookmark = current_account.bookmarks.find_by!(status_id: target_status_id)
  end

  def target_status_id
    Status.where(id: params[:status_id]).pick(:reblog_of_id) || params[:status_id]
  end

  def requested_note
    note = params[:note]
    return note if note.nil? || note.is_a?(String)

    raise Mastodon::ValidationError, I18n.t('bookmarks.errors.invalid_note')
  end
end
