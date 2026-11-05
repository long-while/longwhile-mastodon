# frozen_string_literal: true

class CollectionPolicy < ApplicationPolicy
  def index?
    true
  end

  def show?
    current_account.nil? || !owner.blocking_or_domain_blocking?(current_account)
  end

  # @_longwhile — 컬렉션(4.6)은 만들 수 없다.
  #   이 인스턴스의 글은 모두 팔로워 전용이고 공개 글은 공지 계정만 쓴다. 컬렉션의
  #   이름·설명은 로그인한 모두에게(그리고 AP 엔드포인트로) 보이는 공개 글이 되어 그 규칙을
  #   비켜 간다. 또 로컬 계정은 승인 없이 담기므로, 팔로워가 프로텍트 계정을 담으면 숨겨 둔
  #   팔로우 관계(hides_followers?)가 드러난다. 고정 프런트에는 컬렉션 화면이 없다.
  #   비연합이라 원격 컬렉션도 들어오지 않으므로, 막는 곳은 여기 한 곳이면 된다.
  def create?
    false
  end

  def update?
    owner?
  end

  def destroy?
    owner?
  end

  private

  def owner?
    current_account == owner
  end

  def owner
    record.account
  end
end
