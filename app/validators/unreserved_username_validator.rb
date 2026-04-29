# frozen_string_literal: true

class UnreservedUsernameValidator < ActiveModel::Validator
  # Setting.reserved_usernames 의 운영자 변경 여부와 무관하게 항상 예약되어야 하는 아이디.
  # 공지용 계정(@longwhile) 등 시스템 단위로 보호되어야 하는 아이디만 등록한다.
  ALWAYS_RESERVED_USERNAMES = %w(
    longwhile
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
    settings_has_reserved_usernames? && settings_reserves_username?
  end

  def settings_has_reserved_usernames?
    Setting.reserved_usernames.present?
  end

  def settings_reserves_username?
    Setting.reserved_usernames.include?(@username.downcase)
  end
end
