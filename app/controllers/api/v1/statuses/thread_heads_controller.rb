# frozen_string_literal: true

class Api::V1::Statuses::ThreadHeadsController < Api::BaseController
  before_action -> { doorkeeper_authorize! :read, :'read:statuses' }
  before_action :require_user!
  before_action :check_ids_limit

  MAX_IDS = 40

  def index
    thread_heads = ThreadHead.for_statuses(status_ids, current_account)
    heads        = preload_collection(thread_heads.map(&:head).uniq, Status)

    render json: thread_heads,
           each_serializer: REST::ThreadHeadSerializer,
           relationships: StatusRelationshipsPresenter.new(heads, current_account.id)
  end

  private

  def check_ids_limit
    raise Mastodon::ValidationError, "Too many ids (maximum #{MAX_IDS})" if status_ids.size > MAX_IDS
  end

  def status_ids
    @status_ids ||= Array(params.permit(id: [])[:id]).map(&:to_i).select(&:positive?).uniq
  end
end
