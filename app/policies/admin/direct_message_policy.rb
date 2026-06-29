# frozen_string_literal: true

# ═══════════════════════════════════════════════════════════════════════════
# @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 운영 관리 권한
#   DM 본문 열람은 StatusPolicy 상 admin / owner 권한자에게 허용되므로
#   (StatusPolicy#administrator? == can?(:administrator, :manage_roles)),
#   목록 페이지도 동일 권한으로 맞춰 권한 불일치(클릭 시 403)를 방지.
#   :administrator 단독은 owner 전용이라 admin 이 403 을 받던 회귀를 수정.
# ═══════════════════════════════════════════════════════════════════════════
class Admin::DirectMessagePolicy < ApplicationPolicy
  def index?
    role.can?(:administrator, :manage_roles)
  end
end
