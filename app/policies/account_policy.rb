# frozen_string_literal: true

class AccountPolicy < ApplicationPolicy
  def index?
    role.can?(:manage_users)
  end

  def show?
    role.can?(:manage_users)
  end

  def warn?
    role.can?(:manage_users, :manage_reports) && role.overrides?(record.user_role)
  end

  def suspend?
    role.can?(:manage_users, :manage_reports) && role.overrides?(record.user_role) && !record.instance_actor?
  end

  def destroy?
    record.suspended_temporarily? && role.can?(:delete_user_data)
  end

  def unsuspend?
    role.can?(:manage_users) && record.suspension_origin_local?
  end

  def sensitive?
    role.can?(:manage_users, :manage_reports) && role.overrides?(record.user_role)
  end

  def unsensitive?
    role.can?(:manage_users)
  end

  def silence?
    role.can?(:manage_users, :manage_reports) && role.overrides?(record.user_role)
  end

  def unsilence?
    role.can?(:manage_users)
  end

  def redownload?
    role.can?(:manage_federation)
  end

  def remove_avatar?
    role.can?(:manage_users, :manage_reports) && role.overrides?(record.user_role)
  end

  def remove_header?
    role.can?(:manage_users, :manage_reports) && role.overrides?(record.user_role)
  end

  def memorialize?
    role.can?(:delete_user_data) && role.overrides?(record.user_role) && !record.instance_actor?
  end

  def unblock_email?
    role.can?(:manage_users)
  end

  def review?
    role.can?(:manage_taxonomies)
  end

  # ═══════════════════════════════════════════════════════════════════════════
  # @_longwhile custom feature / 한참(longwhile) 제작 기능 — 관리자 계정 보호 토글
  # 이 기능을 사용·재사용하려면 서버 내에 아래 출처를 반드시 표기해야 합니다.
  # If you use or reuse this feature, you must credit the author on your server.
  #   Twitter/X : @_longwhile  ·  https://twitter.com/_longwhile  /  Crepe : https://kre.pe/QTRx
  # ═══════════════════════════════════════════════════════════════════════════
  def toggle_protect?
    role.can?(:manage_users) && role.overrides?(record.user_role)
  end
end
