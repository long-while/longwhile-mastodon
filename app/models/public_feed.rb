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
    return [] if incompatible_feed_settings?

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

  def incompatible_feed_settings?
    (local_only? && !user_has_access_to_feed?(local_feed_setting)) || (remote_only? && !user_has_access_to_feed?(remote_feed_setting))
  end

  def user_has_access_to_feed?(setting)
    case setting
    when 'public'
      true
    when 'authenticated'
      @account&.user&.functional?
    when 'disabled'
      @account&.user&.can?(:view_feeds)
    end
  end

  def with_reblogs?
    options[:with_reblogs]
  end

  def with_replies?
    options[:with_replies]
  end

  def local_feed_setting
    Setting.local_live_feed_access
  end

  def remote_feed_setting
    Setting.remote_live_feed_access
  end

  def local_only?
    (options[:local] && !options[:remote]) || !user_has_access_to_feed?(remote_feed_setting)
  end

  def remote_only?
    (options[:remote] && !options[:local]) || !user_has_access_to_feed?(local_feed_setting)
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
  private_constant :WITHOUT_MENTIONS_SQL

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
  # - 본인이 멘션된 툿은 제외 (이미 멘션/알림 타임라인에서 확인 가능). silent 멘션은 세지 않는다 —
  #   4.5 의 인용이 인용당한 사람에게 silent 멘션을 달아서, 세면 운영진의 글을 인용한 글이 빠진다
  # - 산개 멘션은 일반 사용자와 똑같이 제외한다
  #
  # **direct 는 넣지 않는다.** 운영진이라도 DM 은 타임라인에서 보지 않고
  # /admin/direct_messages 와 /messages/all 에서만 본다. 여기 한 줄이 열려 있으면
  # 운영진 계정의 퍼블툿에 남의 DM 이 섞여 흐른다.
  def administrator_public_scope(base_scope)
    mentioned_ids = Mention.active.where(account_id: account.id).select(:status_id)

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
  #
  # @_longwhile custom fix — **이 조건은 반드시 원시 SQL 이어야 한다.**
  #
  #   한때 이것을 `where(account_id: ...)` 나 Arel 노드로 적었다. 둘 다
  #   `statuses.account_id` 를 가리키는 **컬럼 조건**이고, 그래서 아래 `get` 의
  #
  #       scope.merge!(account_filters_scope)   # Status.not_excluded_by_account
  #
  #   한 줄이 이 조건을 **통째로 지웠다.** `not_excluded_by_account` 가
  #   `where.not(account_id: …)` 라 같은 컬럼을 건드리는데, ActiveRecord 의
  #   `merge` 는 "나중 것이 이긴다" 규칙으로 **먼저 있던 같은 컬럼 조건을 버린다**
  #   (`WhereClause#merge` → `except_predicates`). 차단·뮤트 필터 하나가 팔로우
  #   필터를 먹은 것이다.
  #
  #   증상은 조용했다. 문법 오류도 느려짐도 없이 **퍼블릭 타임라인에만** 팔로우
  #   하지 않은 사람의 비공개·미등재 글이 흘렀다. 홈은 팬아웃이라 멀쩡했고
  #   프로필은 AccountStatusesFilter 라 멀쩡해서, 한 화면에서만 새는 모양이었다.
  #   같은 이유로 태그 타임라인(TagFeed)도 함께 샜다 — 그쪽도 같은 merge 를 한다.
  #
  #   원시 SQL 은 `merge` 가 들여다보지 않는다(`Arel.fetch_attribute` 는 String 을
  #   그냥 넘긴다). 그래서 이 파일의 다른 조건들(`reblog_author_visible_sql`,
  #   `WITHOUT_MENTIONS_SQL`)은 처음부터 무사했다. 같은 방식으로 맞춘다.
  #
  #   **컬럼 조건으로 되돌리지 말 것.** 되돌리면 조용히 다시 샌다.
  def visible_authors_scope(base_scope)
    base_scope.where(visible_authors_sql)
  end

  def visible_authors_sql
    author_visible_sql('statuses')
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
          AND #{author_visible_sql('reblogged_statuses')}
      ))
    SQL
  end

  # 글쓴이 범위를 SQL 조각 하나로. 위의 둘(`visible_authors_sql` ·
  # `reblog_author_visible_sql`)이 함께 쓴다 — 두 곳이 어긋나면 "글은 보이는데
  # 그 글의 재게시는 안 보인다" 같은 형태로 틀어진다.
  #
  # **메모한다.** 한 요청에서 두 번 불리는데, 두 번이 같은 문자열이어야 위의
  # "어긋나지 않는다" 가 코드로 보장된다. 덤으로 쿼리 조립도 한 번만 한다.
  #
  # `to_sql` 로 값을 미리 펼쳐 넣는다. 바인드로 넘기면 Relation 이 잘못 전개된다.
  def visible_author_ids_sql
    @visible_author_ids_sql ||= Account
                                .where(id: followed_ids)
                                .or(Account.where(id: visible_account_ids))
                                .select(:id)
                                .to_sql
  end

  # 글쓴이 조건 — 팔로우 중 + 본인, 그리고 공지 계정의 **unlisted(공지)만**.
  #
  # 공지 계정 예외를 글쓴이 목록에 통째로 넣었던 때는 그 계정이 팔로워 전용(private)으로
  # 쓴 글까지 팔로우하지 않은 전원에게 흘렀다(글 주소로는 StatusPolicy 가 막는데 이
  # 피드로는 보였다). 그 글을 누가 재게시해도 마찬가지였다.
  #
  # 원글(`statuses`)과 재게시 원본(`reblogged_statuses`)에 같은 규칙을 쓴다.
  def author_visible_sql(table)
    condition = "#{table}.account_id IN (#{visible_author_ids_sql})"
    return condition if announcement_account_id.nil?

    announcement = "#{table}.account_id = #{announcement_account_id.to_i} AND #{table}.visibility = #{Status.visibilities.fetch('unlisted')}"

    "(#{condition} OR (#{announcement}))"
  end

  def announcement_account_id
    return @announcement_account_id if defined?(@announcement_account_id)

    @announcement_account_id = self.class.announcement_account_id
  end

  def followed_ids
    @followed_ids ||= Follow.where(account_id: account.id).select(:target_account_id)
  end

  def visible_account_ids
    @visible_account_ids ||= [account.id]
  end

  # 로그인이 막힌(disabled 등) 운영진 계정에 남은 토큰에는 운영진용 범위를 주지 않는다.
  # AccountStatusesFilter#administrator? 와 같은 조건이다.
  def administrator?
    account&.user&.functional? && account.user.can?(:administrator, :manage_roles)
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
