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

    def index
      authorize [:admin, :direct_message], :index?

      @direct_messages = filtered_direct_messages.page(params[:page]).per(PER_PAGE)
    end

    private

    def filtered_direct_messages
      scope = Status.where(visibility: :direct)
                    .includes(:account, :mentioned_accounts)
                    .order(id: :desc)

      scope = apply_search(scope)
      apply_exclude_mentioning(scope)
    end

    # 발신자 username 또는 본문 텍스트로 검색.
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
        .reject(&:blank?)
        .uniq
    end
  end
end
