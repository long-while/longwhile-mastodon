# frozen_string_literal: true

module Account::Suspensions
  extend ActiveSupport::Concern

  included do
    scope :suspended, -> { where.not(suspended_at: nil) }
    scope :without_requested_deletion, -> { where(requested_deletion_at: nil) }
    scope :without_suspended, -> { without_requested_deletion.where(suspended_at: nil) }

    # @_longwhile — 정지·자기 삭제·익명화(탈퇴)를 함께 거른다. `unavailable?` 의 짝이다.
    # 탈퇴 계정은 정지도 삭제도 아니다 — DeleteAccountService 가 글을 남기는 모드에서
    # `suspended_at`·`requested_deletion_at` 을 비워 두고 `anonymized_at` 만 채운다.
    # 그래서 `without_suspended` 만으로는 걸리지 않는다.
    scope :without_unavailable, -> { without_suspended.where(anonymized_at: nil) }
  end

  def suspended?
    suspended_at.present? && !instance_actor?
  end

  # A deleted account whose posts were kept. It has no owner any more, so it is
  # treated as unavailable everywhere an account can act, but its statuses stay
  # readable — see StatusPolicy#show?.
  def anonymized?
    anonymized_at.present?
  end

  def suspended_locally?
    suspended? && suspension_origin_local?
  end

  def suspended_permanently?
    suspended? && deletion_request.nil?
  end

  def suspended_temporarily?
    suspended? && deletion_request.present?
  end

  def unavailable?
    deleted? || suspended? || anonymized?
  end

  # @_longwhile — 익명화 계정은 넣지 않는다. 남겨 둔 글의 주소(`/@이름/글`)와 프로필이
  #   `AccountOwnedConcern` 에서 410 이 되기 때문이다(4.6 까지의 `suspended_permanently?`
  #   별칭과 같은 범위).
  def permanently_unavailable?
    (deleted? || suspended?) && deletion_request.nil?
  end

  def suspend!(date: Time.now.utc, origin: :local, block_email: true)
    transaction do
      create_deletion_request!
      update!(suspended_at: date, suspension_origin: origin)
      create_canonical_email_block! if block_email
    end

    # This terminates all connections for the given account with the streaming
    # server:
    redis.publish("timeline:system:#{id}", { event: :kill }.to_json) if local?
  end

  def unsuspend!
    transaction do
      deletion_request&.destroy!
      update!(suspended_at: nil, suspension_origin: nil)
      destroy_canonical_email_block!
    end
  end
end
