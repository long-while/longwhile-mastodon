# frozen_string_literal: true

class Api::V1::Bookmarks::AuthorsController < Api::BaseController
  AUTHORS_LIMIT = 40

  before_action -> { doorkeeper_authorize! :read, :'read:bookmarks' }
  before_action :require_user!

  def index
    ids = author_ids
    accounts = Account.where(id: ids).index_by(&:id)
    render json: ids.filter_map { |id| accounts[id] }, each_serializer: REST::AccountSerializer
  end

  private

  def author_ids
    current_account.bookmarks
      .joins(:status)
      .group('statuses.account_id')
      .order(Arel.sql('COUNT(*) DESC, MAX(bookmarks.id) DESC'))
      .limit(AUTHORS_LIMIT)
      .pluck('statuses.account_id')
  end
end
