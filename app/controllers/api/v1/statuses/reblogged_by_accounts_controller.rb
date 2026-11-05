# frozen_string_literal: true

class Api::V1::Statuses::RebloggedByAccountsController < Api::V1::Statuses::BaseController
  before_action -> { authorize_if_got_token! :read, :'read:accounts' }
  after_action :insert_pagination_headers

  def index
    cache_if_unauthenticated!
    @accounts = load_accounts
    render json: @accounts, each_serializer: REST::AccountSerializer
  end

  private

  def load_accounts
    scope = default_accounts
    scope = scope.not_excluded_by_account(current_account) unless current_account.nil?
    scope.merge(paginated_statuses).to_a
  end

  def default_accounts
    Account.without_suspended.includes(:statuses, :account_stat, :user).references(:statuses)
  end

  # distributable_visibility(public/unlisted)로 좁히지 않는다. 이 인스턴스의 재게시는
  # 전부 private 이라 그대로 두면 재게시 수는 3 인데 목록은 비는 화면이 나온다.
  # 이 엔드포인트는 상위(BaseController#set_status)에서 이미 원본에 대한 열람 권한을
  # 확인한다 — 마음에 들어요 목록과 같은 기준으로, 원본을 볼 수 있으면 누가 눌렀는지도 본다.
  def paginated_statuses
    Status.where(reblog_of_id: @status.id).not_direct_visibility.paginate_by_max_id(
      limit_param(DEFAULT_ACCOUNTS_LIMIT),
      params[:max_id],
      params[:since_id]
    )
  end

  def next_path
    api_v1_status_reblogged_by_index_url pagination_params(max_id: pagination_max_id) if records_continue?
  end

  def prev_path
    api_v1_status_reblogged_by_index_url pagination_params(since_id: pagination_since_id) unless @accounts.empty?
  end

  def pagination_max_id
    @accounts.last.statuses.last.id
  end

  def pagination_since_id
    @accounts.first.statuses.first.id
  end

  def records_continue?
    @accounts.size == limit_param(DEFAULT_ACCOUNTS_LIMIT)
  end
end
