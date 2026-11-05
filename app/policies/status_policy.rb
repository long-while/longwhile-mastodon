# frozen_string_literal: true

class StatusPolicy < ApplicationPolicy
  def show?
    # An anonymised author is unavailable as a person but its posts are kept on
    # purpose, so only a real suspension hides them.
    return false if author.unavailable? && !author.anonymized?
    return true if administrator?

    # 재게시는 감싼 쪽과 원본이 모두 보여야 보인다. 즉 B 가 A 의 툿을 재게시했으면
    # A 와 B 를 모두 팔로우한 사람에게만 보인다. 재게시한 본인은 예외 —
    # 나중에 A 를 언팔로우해도 자기 재게시는 계속 보여야 한다.
    return false if record.reblog? && !owned? && !reblogged_status_visible?
    # 그 예외도 원작자가 부스트한 사람을 **차단**하면 끝난다. 아니면 차단당한 사람이
    # 자기 부스트(감싼 쪽에 원본 본문이 실린다)로 원작자의 비공개 글을 계속 읽는다.
    return false if record.reblog? && owned? && reblogged_author_blocking?

    if requires_mention?
      owned? || mention_exists?
    elsif announcement?
      # 공지 계정의 unlisted 는 팔로우와 무관하게 모든 로컬 계정의 피드로 가는 공지다
      # (943745d134, FanOutOnWriteService#announcement_broadcast?·PublicFeed). 글 주소도
      # 로그인한 사람에게는 열어 준다. 비로그인과 그 계정이 차단한 사람은 제외한다.
      !current_account.nil? && !author_blocking?
    elsif private? || unlisted?
      # @_longwhile — **미등재(unlisted)를 비공개와 같이 다룬다.**
      #
      #   상류에서 미등재는 "타임라인·해시태그에 안 뜰 뿐 링크를 열면 누구나
      #   본다" 는 뜻이다. 이 인스턴스에서는 그 전제가 맞지 않는다 — 팔로우
      #   수동 수락을 켜 둔 계정이 많고, 승인하지 않은 사람에게 지난 글이
      #   보이는 것을 의도한 사람은 없다.
      #
      #   프로필 목록 쪽은 `AccountStatusesFilter` 가 같은 규칙으로 좁힌다.
      #   **한쪽만 고치면 새는 곳이 남는다** — 목록에서 감춰도 글 주소를 직접
      #   열면 그만이다. 두 파일이 짝이다.
      #
      #   `mention_exists?` 가 남아 있는 것이 중요하다. 나를 부른 글은 팔로우
      #   여부와 무관하게 보여야 한다.
      owned? || following_author? || mention_exists?
    else
      current_account.nil? || (!author_blocking? && !author_blocking_domain?)
    end
  end

  def quote?
    show? && !blocking_author? && record.quote_policy_for_account(current_account) != :denied
  end

  # upstream 은 private 툿을 작성자만 재게시할 수 있게 막는다. 이 인스턴스는 모든
  # 툿이 private 이라 그 규칙을 그대로 두면 재게시가 통째로 사라진다. 대신 새는 것은
  # show? 쪽에서 막는다 — 재게시는 원작자를 팔로우하는 사람에게만 보인다.
  def reblog?
    !author.anonymized? && !requires_mention? && show? && !blocking_author?
  end

  def favourite?
    !author.anonymized? && show? && !blocking_author?
  end

  def destroy?
    owned?
  end

  alias unreblog? destroy?

  def update?
    owned?
  end

  private

  def requires_mention?
    record.direct_visibility? || record.limited_visibility?
  end

  # 원본이 지워졌으면(reblog 가 nil) 감싼 쪽도 보여줄 것이 없다.
  # 원본은 절대 재게시가 아니므로(ReblogService 가 항상 원본으로 되돌린다) 재귀는 한 단계에서 끝난다.
  def reblogged_status_visible?
    original = record.reblog
    return false if original.nil?

    StatusPolicy.new(current_account, original).show?
  end

  # 미리 읽은 관계(blocked_by)는 감싼 쪽 글쓴이 기준으로만 만들어지는 경우가 있어
  # 원작자가 빠져 있을 수 있다. 빠졌다고 "차단 안 함" 으로 읽으면 새므로 직접 묻는다.
  def reblogged_author_blocking?
    original_author = record.reblog&.account
    return false if original_author.nil? || current_account.nil?

    original_author.blocking?(current_account)
  end

  def owned?
    author.id == current_account&.id
  end

  def private?
    record.private_visibility?
  end

  def unlisted?
    record.unlisted_visibility?
  end

  # 다른 계정의 unlisted(943745d134 이전 기본값으로 쓴 옛 글)는 여기 들지 않는다.
  def announcement?
    unlisted? && author.announcement_account?
  end

  def mention_exists?
    return false if current_account.nil?

    if record.mentions.loaded?
      record.mentions.any? { |mention| mention.account_id == current_account.id }
    else
      record.mentions.exists?(account: current_account)
    end
  end

  def author_blocking_domain?
    return false if current_account.nil? || current_account.domain.nil?

    author.domain_blocking?(current_account.domain)
  end

  def blocking_author?
    return false if current_account.nil?

    current_account.blocking?(author)
  end

  def author_blocking?
    return false if current_account.nil?

    current_account.blocked_by?(author)
  end

  def following_author?
    return false if current_account.nil?

    current_account.following?(author)
  end

  def author
    record.account
  end

  # ═══════════════════════════════════════════════════════════════════════════
  # @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 운영진 열람
  #   admin / owner 권한자는 모든 가시범위(direct 포함) 게시물을 열람할 수 있음
  # 이 기능을 사용·재사용하려면 서버 내에 아래 출처를 반드시 표기해야 합니다.
  # If you use or reuse this feature, you must credit the author on your server.
  #   Twitter/X : @_longwhile  ·  https://twitter.com/_longwhile
  #   Crepe     : https://kre.pe/QTRx
  # ═══════════════════════════════════════════════════════════════════════════
  def administrator?
    # 로그인이 막힌(disabled·미승인·2FA 미설정 등) 운영진 계정의 토큰에는 열람 권한을 주지 않는다.
    current_account&.user&.functional? && current_account.user.can?(:administrator, :manage_roles)
  end
end
