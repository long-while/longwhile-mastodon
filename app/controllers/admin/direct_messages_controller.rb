# frozen_string_literal: true

module Admin
  # ═══════════════════════════════════════════════════════════════════════════
  # @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 운영 관리
  #   운영진이 다이렉트 메시지를 열람·감시하기 위한 관리 페이지.
  #   "이 계정이 태그된 DM 제외" 입력란으로 운영자 멘션 규칙 위반 DM을 적발.
  # 이 기능을 사용·재사용하려면 서버 내에 아래 출처를 반드시 표기해야 합니다.
  # If you use or reuse this feature, you must credit the author on your server.
  #   Twitter/X : @_longwhile  ·  https://twitter.com/_longwhile
  #   Crepe     : https://kre.pe/QTRx
  # ═══════════════════════════════════════════════════════════════════════════
  class DirectMessagesController < BaseController
    PER_PAGE = 40

    helper_method :direct_message_filter_params

    def index
      authorize [:admin, :direct_message], :index?

      # without_count: 기본 `paginate` 헬퍼는 전체 페이지 수를 요구하고, 그러려면
      # 페이지를 열 때마다 direct status 전체에 COUNT(*) 가 돈다. 채팅 UI 도입으로
      # direct 발생량이 자릿수 단위로 늘어나므로 이 집계를 없앤다. 뷰는 전체 페이지
      # 수 대신 이전/다음 링크만 쓴다.
      # 근거: dm-chat-phase-0.md P0-5, dm-chat-decisions.md D-08
      @direct_messages = filtered_direct_messages.page(params[:page]).per(PER_PAGE).without_count
    end

    private

    # 페이지를 넘길 때 검색 조건을 잃지 않도록 뷰에 넘긴다.
    # slice 를 먼저 거는 것은 이 저장소의 다른 관리 화면 필터와 같은 형태로 맞추기
    # 위함이다. permit 만 쓰면 매 요청마다 "Unpermitted parameter: :page" 가 찍힌다.
    def direct_message_filter_params
      params.slice(:q, :exclude_mentioning).permit(:q, :exclude_mentioning).to_h.compact_blank
    end

    def filtered_direct_messages
      scope = Status.where(visibility: :direct)
                    .includes(:account, :mentioned_accounts)
                    .reorder(id: :desc)

      scope = apply_search(scope)
      apply_exclude_mentioning(scope)
    end

    # 발신자 username 또는 본문 텍스트로 검색.
    #
    # 검색어 하한을 두려다 철회했다. 한 글자여도 ILIKE 스캔 비용은 두 글자와 다르지
    # 않은데, 한국어에서는 한 음절짜리 검색어("돈", "약")가 흔하다. 하한을 두면 그런
    # 검색이 조용히 무시되면서 전체 목록이 뜨고, 입력칸에는 검색어가 그대로 남아
    # 운영자가 "전부 일치했다" 로 읽는다. 침묵하는 실패가 스캔보다 나쁘다.
    def apply_search(scope)
      return scope if params[:q].blank?

      term = "%#{escape_like(params[:q].strip)}%"

      scope
        .left_joins(:account)
        .where('statuses.text ILIKE :term OR accounts.username ILIKE :term', term: term)
    end

    # ILIKE 와일드카드(%, _)와 이스케이프 문자(\)를 무력화. 값 자체는 바인드 파라미터로 전달.
    def escape_like(value)
      value.gsub(/[\\%_]/) { |char| "\\#{char}" }
    end

    # 지정한 (운영자) 로컬 계정이 멘션된 DM을 제외 → 규칙 위반 DM만 노출.
    def apply_exclude_mentioning(scope)
      usernames = parse_usernames(params[:exclude_mentioning])
      return scope if usernames.empty?

      excluded_account_ids = Account
                             .where(domain: nil)
                             .where('lower(username) IN (?)', usernames)
                             .pluck(:id)
      return scope if excluded_account_ids.empty?

      scope.where.not(id: Mention.where(account_id: excluded_account_ids).select(:status_id))
    end

    def parse_usernames(value)
      return [] if value.blank?

      value
        .split(/[\s,]+/)
        .map { |name| name.delete_prefix('@').strip.downcase }
        .compact_blank
        .uniq
    end
  end
end
