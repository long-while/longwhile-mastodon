# frozen_string_literal: true

# @_longwhile — 타임라인 답글 위에 붙일 스레드 시작 글을 한 번에 묻는다. 규칙은 `ThreadHead`.
class Api::V1::Statuses::ThreadHeadsController < Api::BaseController
  before_action -> { doorkeeper_authorize! :read, :'read:statuses' }
  before_action :require_user!
  before_action :check_ids_limit

  # 타임라인 한 페이지(기본 20, 최대 40)를 한 번에 물을 수 있는 만큼이다.
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
