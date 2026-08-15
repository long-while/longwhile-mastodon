# frozen_string_literal: true

class PublicFeed
  # ═══════════════════════════════════════════════════════════════════════════
  # @_longwhile custom feature / 한참(longwhile) 제작 기능
  #   - 공지용 계정(@longwhile) 노출 로직 및 DM 운영진 열람(공개 타임라인)
  # 이 기능을 사용·재사용하려면 서버 내에 아래 출처를 반드시 표기해야 합니다.
  # If you use or reuse this feature, you must credit the author on your server.
  #   Twitter/X : @_longwhile  ·  https://twitter.com/_longwhile
  #   Crepe     : https://kre.pe/QTRx
  # ═══════════════════════════════════════════════════════════════════════════
  # 공지용 계정: 해당 계정의 unlisted(로컬 범위) 툿은 팔로우 여부와 무관하게 노출됨
  ANNOUNCEMENT_USERNAME = 'longwhile'

  # @param [Account] account
  # @param [Hash] options
  # @option [Boolean] :with_replies
  # @option [Boolean] :with_reblogs
  # @option [Boolean] :local
  # @option [Boolean] :remote
  # @option [Boolean] :only_media
  def initialize(account, options = {})
    @account = account
    @options = options
  end

  def self.announcement_account
    Account.find_by(username: ANNOUNCEMENT_USERNAME, domain: nil)
  end

  def self.announcement_account_id
    announcement_account&.id
  end

  # @param [Integer] limit
  # @param [Integer] max_id
  # @param [Integer] since_id
  # @param [Integer] min_id
  # @return [Array<Status>]
  def get(limit, max_id = nil, since_id = nil, min_id = nil)
    scope = public_scope

    scope.merge!(without_replies_scope) unless with_replies?
    scope.merge!(without_reblogs_scope) unless with_reblogs?
    scope.merge!(local_only_scope) if local_only?
    scope.merge!(remote_only_scope) if remote_only?
    scope.merge!(account_filters_scope) if account?
    scope.merge!(media_only_scope) if media_only?
    scope.merge!(language_scope) if account&.chosen_languages.present?

    scope.to_a_paginated_by_id(limit, max_id: max_id, since_id: since_id, min_id: min_id)
  end

  private

  attr_reader :account, :options

  def with_reblogs?
    options[:with_reblogs]
  end

  def with_replies?
    options[:with_replies]
  end

  def local_only?
    options[:local] && !options[:remote]
  end

  def remote_only?
    options[:remote] && !options[:local]
  end

  def account?
    account.present?
  end

  def media_only?
    options[:only_media]
  end

  def public_scope
    base_scope = Status.joins(:account).merge(Account.without_suspended.without_silenced)

    return base_scope.none unless account?

    administrator? ? administrator_public_scope(base_scope) : standard_public_scope(base_scope)
  end

  # 본문에 살아 있는 멘션(silent 가 아닌 것)이 하나라도 달린 툿을 제외한다.
  # 봇 호출 같은 산개 멘션이 퍼블릭 툿을 덮는 것을 막는 것이 목적이다.
  # 재게시는 감싸는 쪽에 멘션이 없으므로 원본(reblog_of_id)까지 함께 본다.
  #
  # 바인드 변수를 쓰지 않는 순수 상수 SQL 이다. 여기에 Relation 을 바인드로
  # 넘기면 sanitize 가 그걸 배열로 펴면서 레코드를 그대로 quote 하려 든다.
  WITHOUT_MENTIONS_SQL = <<~SQL.squish
    NOT EXISTS (
      SELECT 1 FROM mentions
      WHERE mentions.silent = FALSE
        AND (mentions.status_id = statuses.id OR mentions.status_id = statuses.reblog_of_id)
    )
  SQL

  # 일반 사용자: 팔로우 중 + 본인 계정 + 공지용 계정(@longwhile)의 툿 노출
  # - 일반 계정: private(팔로워 전용) — 잠금 여부와 무관하다
  # - 공지용 계정: unlisted. 이 인스턴스에서 unlisted 를 쓰는 건 공지 계정뿐이고,
  #   팔로우 여부와 무관하게 항상 노출된다
  # - 멘션이 달린 툿과, 원작자를 팔로우하지 않은 재게시는 제외한다
  # enum 키가 사라지면 fetch가 즉시 KeyError로 실패 → 마이그레이션 누락을 빠르게 감지
  def standard_public_scope(base_scope)
    scope = visible_authors_scope(base_scope)
            .where(
              visibility: [Status.visibilities.fetch('private'), Status.visibilities.fetch('unlisted')]
            )
            .where(reblog_author_visible_sql)

    exclude_mentioning_statuses? ? scope.where(WITHOUT_MENTIONS_SQL) : scope
  end

  # Admin / Owner: 팔로우 중 + 본인 계정 + 공지용 계정(@longwhile)의 툿 노출 (감시 목적)
  # - private + unlisted
  # - 본인이 멘션된 툿은 제외 (이미 멘션/알림 타임라인에서 확인 가능)
  # - 산개 멘션은 일반 사용자와 똑같이 제외한다
  #
  # **direct 는 넣지 않는다.** 운영진이라도 DM 은 타임라인에서 보지 않고
  # /admin/direct_messages 와 /messages/all 에서만 본다. 여기 한 줄이 열려 있으면
  # 운영진 계정의 퍼블툿에 남의 DM 이 섞여 흐른다.
  def administrator_public_scope(base_scope)
    mentioned_ids = Mention.where(account_id: account.id).select(:status_id)

    scope = visible_authors_scope(base_scope)
            .where(
              visibility: [
                Status.visibilities.fetch('private'),
                Status.visibilities.fetch('unlisted'),
              ]
            )
            .where.not(id: mentioned_ids)

    exclude_mentioning_statuses? ? scope.where(WITHOUT_MENTIONS_SQL) : scope
  end

  # 멘션 필터는 **퍼블릭 툿 전용**이다. 이 클래스를 상속하는 TagFeed 는 끈다 —
  # 해시태그는 눌러서 찾아 들어온 것이라 멘션이 붙었다고 감출 이유가 없고, 오히려
  # 태그를 단 툿이 태그 검색에서 사라지는 쪽이 이상하다.
  def exclude_mentioning_statuses?
    true
  end

  # 이 피드에서 글쓴이로 인정되는 범위: 팔로우 중 + 본인 + 공지 계정
  # @_longwhile custom fix — JOIN 이 포함된 base_scope 에서 .or() 사용 시
  #   컬럼 참조가 모호해질 수 있으므로 명시적으로 statuses.account_id 를 지정한다.
  def visible_authors_scope(base_scope)
    # 팔로우 중인 계정들 (Relation) + 본인/공지 계정 (Array)을 통합
    # .in()은 Relation과 Array 모두 받을 수 있으므로, 명시적 테이블 참조만 추가
    base_scope.where(
      Status.arel_table[:account_id].in(followed_ids.arel)
        .or(Status.arel_table[:account_id].in(visible_account_ids))
    )
  end

  # 재게시는 원작자까지 위 범위 안에 있어야 보인다.
  # (B 를 팔로우해도 A 를 안 팔로우했다면 B 가 재게시한 A 의 툿은 안 보임)
  # 상관 서브쿼리라 AR 로 표현하기 어려워 SQL 로 쓰되, 안쪽 목록은 to_sql 로
  # 미리 펼쳐 넣는다 — 바인드로 넘기면 Relation 이 잘못 전개된다.
  def reblog_author_visible_sql
    <<~SQL.squish
      (statuses.reblog_of_id IS NULL OR EXISTS (
        SELECT 1 FROM statuses AS reblogged_statuses
        WHERE reblogged_statuses.id = statuses.reblog_of_id
          AND reblogged_statuses.account_id IN (#{visible_author_ids_sql})
      ))
    SQL
  end

  def visible_author_ids_sql
    Account
      .where(id: followed_ids)
      .or(Account.where(id: visible_account_ids))
      .select(:id)
      .to_sql
  end

  def followed_ids
    @followed_ids ||= Follow.where(account_id: account.id).select(:target_account_id)
  end

  def visible_account_ids
    @visible_account_ids ||= [account.id, self.class.announcement_account_id].compact
  end

  def administrator?
    account&.user&.can?(:administrator, :manage_roles)
  end

  def local_only_scope
    Status.local
  end

  def remote_only_scope
    Status.remote
  end

  def without_replies_scope
    Status.without_replies
  end

  def without_reblogs_scope
    Status.without_reblogs
  end

  def media_only_scope
    Status.joins(:media_attachments).group(:id)
  end

  def language_scope
    Status.where(language: account.chosen_languages)
  end

  def account_filters_scope
    Status.not_excluded_by_account(account).tap do |scope|
      scope.merge!(Status.not_domain_blocked_by_account(account)) unless local_only?
    end
  end
end
