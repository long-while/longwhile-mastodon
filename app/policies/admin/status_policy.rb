# frozen_string_literal: true

class Admin::StatusPolicy < ApplicationPolicy
  def index?
    role.can?(:manage_reports, :manage_users)
  end

  def show?
    role.can?(:manage_reports, :manage_users) && eligible_to_show?
  end

  def destroy?
    role.can?(:manage_reports)
  end

  def update?
    role.can?(:manage_reports)
  end

  def review?
    role.can?(:manage_taxonomies)
  end

  private

  # distributable?(public/unlisted)는 이 인스턴스에서 언제나 거짓이다 — 일반 툿이
  # 전부 팔로워 전용이라서. 그대로 두면 모더레이터가 신고된 툿 말고는 아무것도 못 본다.
  # 여기까지 오는 것은 show? 가 manage_reports/manage_users 를 이미 확인한 뒤다.
  # DM 은 계속 admin/owner 전용 — viewable_through_normal_policy? 안의
  # StatusPolicy#administrator? 만 통과시킨다.
  def eligible_to_show?
    record.distributable? || record.reported? || moderatable? || viewable_through_normal_policy?
  end

  def moderatable?
    !record.direct_visibility? && !record.limited_visibility?
  end

  def viewable_through_normal_policy?
    StatusPolicy.new(current_account, record).show?
  end
end
