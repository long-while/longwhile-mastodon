# frozen_string_literal: true

class AccountStatusesFilter
  KEYS = %i(
    pinned
    tagged
    only_media
    exclude_replies
    exclude_reblogs
    only_direct
    no_direct
  ).freeze

  attr_reader :params, :account, :current_account

  def initialize(account, current_account, params = {})
    @account         = account
    @current_account = current_account
    @params          = params
  end

  def results
    scope = initial_scope

    scope.merge!(pinned_scope)     if pinned?
    scope.merge!(only_media_scope) if only_media?
    scope.merge!(no_replies_scope) if exclude_replies?
    scope.merge!(no_reblogs_scope) if exclude_reblogs?
    scope.merge!(hashtag_scope)    if tagged?
    scope.merge!(direct_scope)     if only_direct?
    scope.merge!(no_direct_scope)  if no_direct?

    scope
  end

  private

  def initial_scope
    return Status.none if account.unavailable?

    if anonymous?
      # @_longwhile — 로그인하지 않은 방문자에게는 **공개 글만** 보인다.
      #   상류는 `distributable_visibility`(공개 + 미등재)였다. 미등재를 팔로워
      #   전용으로 바꾸었으므로(아래 filtered_scope 주석) 여기도 함께 좁힌다 —
      #   팔로우하지 않은 로그인 사용자보다 익명 방문자가 더 많이 보면 안 된다.
      #
      #   **`public_visibility` 스코프를 쓰면 안 된다.** 이 저장소에서 그 이름은
      #   상류 그대로 `where(visibility: [:public, :unlisted])` 다 — 이름과 달리
      #   미등재를 포함한다. 그래서 조건을 직접 적는다.
      #
      #   **원시 SQL 로 적는다.** `where(visibility: :public)` 은 컬럼 조건이라 아래
      #   `results` 의 `merge!(no_direct_scope)`(where.not(visibility: :direct))가
      #   같은 컬럼이라는 이유로 지운다 — 프로필 API 는 늘 no_direct 를 넣으므로
      #   비로그인에게 private·unlisted 가 통째로 나갔다. only_direct 면 DM 이 나갔다.
      #   (CLAUDE.md "피드의 보안 조건은 원시 SQL 로 적는다" 와 같은 함정)
      account.statuses.where("statuses.visibility = #{Status.visibilities.fetch('public')}")
    elsif administrator?
      without_direct_if_excluded(account.statuses.all) # NOTE: #merge! does not work without the #all
    elsif author?
      # 내 부스트는 원작자를 언팔로우해도 남지만, 원작자가 나를 차단했으면 뺀다
      # (StatusPolicy#show? 와 짝). 원시 SQL 이라 아래 merge! 가 지우지 못한다.
      without_direct_if_excluded(account.statuses.where(<<~SQL.squish))
        statuses.reblog_of_id IS NULL OR NOT EXISTS (
          SELECT 1 FROM statuses AS reblogged_statuses
          JOIN blocks ON blocks.account_id = reblogged_statuses.account_id
          WHERE reblogged_statuses.id = statuses.reblog_of_id
            AND blocks.target_account_id = #{current_account.id.to_i}
        )
      SQL
    elsif blocked?
      Status.none
    else
      filtered_scope
    end
  end

  # ═══════════════════════════════════════════════════════════════════════════
  # @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 운영진 열람
  # 이 기능을 사용·재사용하려면 서버 내에 아래 출처를 반드시 표기해야 합니다.
  # If you use or reuse this feature, you must credit the author on your server.
  #   Twitter/X : @_longwhile  ·  https://twitter.com/_longwhile  /  Crepe : https://kre.pe/QTRx
  # ═══════════════════════════════════════════════════════════════════════════
  # Admin / Owner 역할 보유자: 대상 계정의 모든 가시범위(direct/private 포함) 조회 허용
  def administrator?
    # 로그인이 막힌(disabled·미승인·2FA 미설정 등) 운영진 계정의 토큰에는 열람 권한을 주지 않는다.
    current_account&.user&.functional? && current_account.user.can?(:administrator, :manage_roles)
  end

  # @_longwhile — **미등재(unlisted)는 팔로워에게만 보인다.**
  #
  #   상류에서 미등재는 "타임라인·해시태그에 안 뜰 뿐, 프로필에 오면 누구나
  #   본다" 는 뜻이다. 이 인스턴스에서는 그 전제가 맞지 않는다. 팔로우 수동
  #   수락을 켜 둔 계정이 많고, 승인하지 않은 사람에게 지난 글이 통째로 보이는
  #   것을 의도한 사람은 없다.
  #
  #     상류   팔로워 public unlisted private / 그 외 public unlisted
  #     여기   팔로워 public unlisted private / 그 외 public
  #
  #   **멘션은 그대로 통과한다.** 아래 `.or(...mentions...)` 가 그 몫이고, 나를
  #   부른 글은 팔로우 여부와 무관하게 보여야 한다.
  #
  #   프로필 목록만 좁혀서는 새는 곳이 남는다 — 글 주소를 직접 열면 그만이다.
  #   그쪽은 `StatusPolicy#show?` 에서 함께 막는다. 두 파일이 짝이다.
  def filtered_scope
    scope = account.statuses

    # 4.6 의 exclude_direct 갈래에도 같은 규칙(비팔로워는 public 만, 멘션은 통과)을 건다. 두 곳
    # 중 하나라도 %i(public unlisted) 로 남으면 미등재 글이 다시 샌다.
    #
    # 이 갈래는 **원시 SQL 로 적는다.** 프로필 API 는 늘 no_direct 를 넣고 exclude_direct 는
    # 요청 파라미터로 들어오므로, 컬럼 조건(where(visibility:))이면 results 의
    # merge!(no_direct_scope) 가 같은 컬럼이라며 지운다 — 비팔로워에게 private·unlisted 가
    # 통째로 나갔다(initial_scope 의 익명 갈래와 같은 함정). 아래 else 의 .or(...) 는 OR
    # 묶음이라 merge 가 건드리지 않는다.
    if exclude_direct?
      scope = scope.where(exclude_direct_visibility_sql)
    else
      scope = account.statuses.left_outer_joins(:mentions)
      scope.merge!(scope.where(visibility: follower? ? %i(public unlisted private) : %i(public)).or(scope.where(mentions: { account_id: current_account.id })).group(Status.arel_table[:id]))
    end

    scope.merge!(filtered_reblogs_scope) if reblogs_may_occur?

    scope
  end

  # 상류 4.7.4(#41019)는 비팔로워의 exclude_direct 에서도 **나를 멘션한** 팔로워 전용 글을
  # 보여 준다(else 갈래와 같게). 여기서는 미등재도 팔로워 전용이므로 미등재·팔로워 전용 둘 다
  # 멘션으로 통과시킨다. 상류의 visibility_scope(distributable_visibility = 공개 + 미등재)는
  # 비팔로워에게 미등재를 내주므로 받지 않았다.
  def exclude_direct_visibility_sql
    visibility = ->(name) { Status.visibilities.fetch(name) }
    return "statuses.visibility IN (#{%w(public unlisted private).map(&visibility).join(', ')})" if follower?

    <<~SQL.squish
      (statuses.visibility = #{visibility.call('public')}
        OR (statuses.visibility IN (#{visibility.call('unlisted')}, #{visibility.call('private')})
          AND EXISTS (
            SELECT 1 FROM mentions
            WHERE mentions.status_id = statuses.id
              AND mentions.account_id = #{current_account.id.to_i}
          )))
    SQL
  end

  def filtered_reblogs_scope
    scope = Status.left_outer_joins(reblog: :account)
    scope
      .where(reblog_of_id: nil)
      .or(
        scope
          # This is basically `Status.not_domain_blocked_by_account(current_account)`
          # and `Status.not_excluded_by_account(current_account)` but on the
          # `reblog` association. Unfortunately, there seem to be no clean way
          # to re-use those scopes in our case.
          .where(reblog: { accounts: { domain: nil } }).or(scope.where.not(reblog: { accounts: { domain: current_account.excluded_from_timeline_domains } }))
          .where.not(reblog: { account_id: current_account.excluded_from_timeline_account_ids })
          # 프로필에서도 재게시는 겹팔로워 전용이다 — 원작자를 팔로우해야 보인다.
          .where(reblog: { account_id: reblog_visible_author_ids })
      )
  end

  # 재게시한 원본을 볼 수 있는 작성자: 내가 팔로우 중인 계정 + 나 자신
  def reblog_visible_author_ids
    Account
      .where(id: Follow.where(account_id: current_account.id).select(:target_account_id))
      .or(Account.where(id: current_account.id))
      .select(:id)
  end

  # with_/without_direct_visibility 라는 스코프는 없다. enum 이 suffix: :visibility 로
  # 만들어 주는 이름은 direct_visibility / not_direct_visibility 다. 전에 있던 이름은
  # 호출되는 순간 NoMethodError 였다 — only_direct/no_direct 파라미터를 쓰면 500.
  # 상류 4.6 의 exclude_direct(본인·운영진 갈래). 원시 SQL 이라 results 의 merge! 가 지우지 못한다.
  def without_direct_if_excluded(scope)
    exclude_direct? ? scope.where("statuses.visibility <> #{Status.visibilities.fetch('direct')}") : scope
  end

  def direct_scope
    Status.direct_visibility
  end

  def no_direct_scope
    Status.not_direct_visibility
  end

  def only_media_scope
    Status.without_empty_attachments.joins(:media_attachments).merge(account.media_attachments).group(Status.arel_table[:id])
  end

  def no_replies_scope
    Status.without_replies
  end

  def no_reblogs_scope
    Status.without_reblogs
  end

  def pinned_scope
    account.pinned_statuses.group(Status.arel_table[:id], StatusPin.arel_table[:created_at])
  end

  def hashtag_scope
    tag = Tag.find_normalized(params[:tagged])

    if tag
      Status.tagged_with(tag.id)
    else
      Status.none
    end
  end

  def anonymous?
    current_account.nil?
  end

  def author?
    current_account.id == account.id
  end

  def blocked?
    account.blocking?(current_account) || (current_account.domain.present? && account.domain_blocking?(current_account.domain))
  end

  def follower?
    current_account.following?(account)
  end

  def reblogs_may_occur?
    !exclude_reblogs? && !only_media? && !tagged?
  end

  def pinned?
    truthy_param?(:pinned)
  end

  def only_direct?
    truthy_param?(:only_direct)
  end

  def no_direct?
    truthy_param?(:no_direct)
  end

  def only_media?
    truthy_param?(:only_media)
  end

  def exclude_direct?
    truthy_param?(:exclude_direct)
  end

  def exclude_replies?
    truthy_param?(:exclude_replies)
  end

  def exclude_reblogs?
    truthy_param?(:exclude_reblogs)
  end

  def tagged?
    params[:tagged].present?
  end

  def truthy_param?(key)
    ActiveModel::Type::Boolean.new.cast(params[key])
  end
end
