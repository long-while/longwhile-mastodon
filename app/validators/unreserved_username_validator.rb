# frozen_string_literal: true

class UnreservedUsernameValidator < ActiveModel::Validator
  # ─── @_longwhile custom feature / 한참(longwhile) 제작 기능 — 시스템 예약 아이디(공지 계정 보호) ───
  # 사용·재사용 시 서버 내 출처 표기 필수 / Credit required to use or reuse:
  #   Twitter/X @_longwhile · Crepe https://kre.pe/QTRx
  # Setting.reserved_usernames 의 운영자 변경 여부와 무관하게 항상 예약되어야 하는 아이디.
  # 공지용 계정(@longwhile) 등 시스템 단위로 보호되어야 하는 아이디만 등록한다.
  # `deleted` 는 익명화(탈퇴) 계정 모두가 쓰는 핸들(Account::ANONYMIZED_USERNAME)이다. 누가 가져가면
  # 웹 화면에서 탈퇴한 사용자의 이름을 누를 때 그 사람의 프로필이 열린다.
  ALWAYS_RESERVED_USERNAMES = %w(
    longwhile
    deleted
  ).freeze

  def validate(account)
    @username = account.username

    return if @username.blank?

    account.errors.add(:username, :reserved) if reserved_username?
  end

  private

  def reserved_username?
    always_reserved_username? || pam_username_reserved? || settings_username_reserved?
  end

  def always_reserved_username?
    ALWAYS_RESERVED_USERNAMES.include?(@username.downcase)
  end

  def pam_username_reserved?
    pam_controlled? && pam_reserves_username?
  end

  def pam_controlled?
    Devise.pam_authentication && Devise.pam_controlled_service
  end

  def pam_reserves_username?
    Rpam2.account(Devise.pam_controlled_service, @username)
  end

  def settings_username_reserved?
    UsernameBlock.matches?(@username, allow_with_approval: false)
  end
end
