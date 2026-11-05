# frozen_string_literal: true

class Api::V1::Accounts::StatusesController < Api::V1::Accounts::BaseController
  before_action -> { authorize_if_got_token! :read, :'read:statuses' }
  before_action :set_account

  after_action :insert_pagination_headers

  def index
    cache_if_unauthenticated!
    @statuses = load_statuses
    render json: @statuses, each_serializer: REST::StatusSerializer, relationships: StatusRelationshipsPresenter.new(@statuses, current_user&.account_id)
  end

  private

  def load_statuses
    @account.unavailable? ? [] : preloaded_account_statuses
  end

  def preloaded_account_statuses
    preload_collection_paginated_by_id(
      AccountStatusesFilter.new(@account, current_account, filter_params).results,
      Status,
      limit_param(DEFAULT_STATUSES_LIMIT),
      params_slice(:max_id, :since_id, :min_id)
    )
  end

  # @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
  #   **프로필 타임라인에는 DM 을 내보내지 않는다.** 볼 곳은 /messages 이고,
  #   운영진 열람은 /admin/direct_messages 와 /messages/all 이 맡는다.
  #
  #   fabex(fabef61d23)에서 홈·퍼블릭 피드의 DM 을 걷어냈는데 이 경로가 남아
  #   있었다. AccountStatusesFilter#initial_scope 가 세 갈래로 샌다.
  #
  #     author?         내 프로필에서 내가 보낸 DM 이 보인다 (신고받은 증상)
  #     administrator?  운영진이 남의 프로필에서 그 사람의 DM 을 본다
  #     filtered_scope  `.or(mentions: 나)` 때문에, 나에게 온 DM 이 **보낸 사람의
  #                     프로필**에 뜬다
  #
  #   **필터 자체를 고치지 않는 이유가 있다.** 그 클래스는 ReportService 도 쓴다
  #   — 신고에 첨부할 수 있는 글인지 판정하는 곳이라, 거기서 direct 를 빼면
  #   **사용자가 DM 을 신고할 수 없게 된다**(기획서 §11.7). 프로필 엔드포인트만
  #   빠지는 것이 맞다.
  #
  #   only_direct 도 함께 끈다. 클라이언트가 그것을 넣으면 두 스코프가 부딪혀
  #   빈 결과가 나올 뿐이지만, 의도를 분명히 해 둔다.
  def filter_params
    params.merge(no_direct: true, only_direct: false)
  end

  def pagination_params(core_params)
    params.slice(:limit, *AccountStatusesFilter::KEYS).permit(:limit, *AccountStatusesFilter::KEYS).merge(core_params)
  end

  def next_path
    api_v1_account_statuses_url pagination_params(max_id: pagination_max_id) if records_continue?
  end

  def prev_path
    api_v1_account_statuses_url pagination_params(min_id: pagination_since_id) unless @statuses.empty?
  end

  def records_continue?
    @statuses.size == limit_param(DEFAULT_STATUSES_LIMIT)
  end

  def pagination_collection
    @statuses
  end
end
