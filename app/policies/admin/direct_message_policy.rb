# frozen_string_literal: true

# ═══════════════════════════════════════════════════════════════════════════
# @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 운영 관리 권한
#   DM 본문 열람은 StatusPolicy 상 administrator 권한자에게만 허용되므로,
#   목록 페이지도 administrator 전용으로 제한해 권한 불일치(클릭 시 403)를 방지.
# ═══════════════════════════════════════════════════════════════════════════
class Admin::DirectMessagePolicy < ApplicationPolicy
  def index?
    role.can?(:administrator)
  end
end
