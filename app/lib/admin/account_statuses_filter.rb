# frozen_string_literal: true

class Admin::AccountStatusesFilter < AccountStatusesFilter
  private

  def blocked?
    false
  end

  # ─── @_longwhile custom feature / 한참(longwhile) 제작 기능 — 모더레이터 열람 ───
  # 사용·재사용 시 서버 내 출처 표기 필수 / Credit required to use or reuse:
  #   Twitter/X @_longwhile · Crepe https://kre.pe/QTRx
  #
  # 모든 툿이 팔로워 전용(private)이 되면서, 상위 클래스의 filtered_scope 로는
  # 모더레이터가 대상 계정의 툿을 **하나도** 못 보게 됐다. 전에는 툿이 unlisted 라
  # 비팔로워 분기(public/unlisted)로도 다 보였다. 신고를 처리하려면 봐야 한다.
  #
  # DM 은 계속 admin/owner 전용이다 — 그쪽은 상위의 administrator? 분기가 이미
  # 전 범위를 내주므로 여기서 direct 만 빼면 된다.
  # 이 클래스는 관리 화면에서만 만들어지고, 그 화면은 Admin::StatusPolicy 로
  # 이미 권한을 확인한 뒤다.
  def initial_scope
    return super if account.unavailable? || author? || administrator?

    account.statuses.not_direct_visibility
  end
end
