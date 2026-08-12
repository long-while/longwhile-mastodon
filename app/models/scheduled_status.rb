# frozen_string_literal: true

# == Schema Information
#
# Table name: scheduled_statuses
#
#  id            :bigint(8)        not null, primary key
#  failed_at     :datetime
#  last_error    :string
#  params        :jsonb
#  publishing_at :datetime
#  scheduled_at  :datetime
#  account_id    :bigint(8)        not null
#

class ScheduledStatus < ApplicationRecord
  include Paginable

  TOTAL_LIMIT = (ENV['SCHEDULED_STATUS_TOTAL_LIMIT'] || 300).to_i
  DAILY_LIMIT = (ENV['SCHEDULED_STATUS_DAILY_LIMIT'] || 25).to_i

  # Minimum distance between "now" and the requested publication time. Kept
  # deliberately small so the web UI can offer sub-5-minute scheduling, but
  # non-zero so the time cannot lapse while the user confirms the dialog.
  MINIMUM_OFFSET = (ENV['SCHEDULED_STATUS_MINIMUM_OFFSET'] || 60).to_i.seconds

  # How far ahead the periodic scheduler looks. This is intentionally decoupled
  # from MINIMUM_OFFSET: the precise job is enqueued by the after_commit hook
  # below, and the sweep only exists to recover records whose job was lost (e.g.
  # Redis was flushed). Keep it slightly above the scheduler interval in
  # config/sidekiq.yml so nothing can slip between two sweeps.
  SWEEP_WINDOW = 2.minutes.freeze

  # A claim older than this is assumed to come from a worker that died between
  # claiming and publishing, and may be claimed again.
  STALE_CLAIM_AFTER = 15.minutes.freeze

  belongs_to :account, inverse_of: :scheduled_statuses
  has_many :media_attachments, inverse_of: :scheduled_status, dependent: :nullify

  scope :failed, -> { where.not(failed_at: nil) }
  scope :publishable, -> { where(failed_at: nil) }

  validate :validate_future_date
  validate :validate_total_limit, on: :create
  validate :validate_daily_limit

  after_commit :enqueue_publishing, on: [:create, :update]

  def failed?
    failed_at.present?
  end

  # A worker is publishing this right now. Claims older than STALE_CLAIM_AFTER
  # are treated as abandoned, so a crashed worker cannot lock the record forever.
  def publishing?
    publishing_at.present? && publishing_at > STALE_CLAIM_AFTER.ago
  end

  # Atomically marks this record as being published, so concurrently enqueued
  # jobs for the same record cannot publish it twice. Returns false when
  # another worker already claimed it.
  def claim_for_publishing!
    self.class
        .where(id: id, failed_at: nil)
        .where('publishing_at IS NULL OR publishing_at < ?', STALE_CLAIM_AFTER.ago)
        .update_all(publishing_at: Time.now.utc)
        .positive?
  end

  # Gives the claim back so a retry can pick the record up again.
  def release_claim!
    update_columns(publishing_at: nil)
  end

  def record_failure!(error)
    message = error.presence || I18n.t('scheduled_statuses.failures.unknown')
    update_columns(last_error: message.to_s.truncate(500), failed_at: Time.now.utc)
  end

  private

  def validate_future_date
    errors.add(:scheduled_at, I18n.t('scheduled_statuses.too_soon')) if scheduled_at.present? && scheduled_at <= Time.now.utc + MINIMUM_OFFSET
  end

  def validate_total_limit
    errors.add(:base, I18n.t('scheduled_statuses.over_total_limit', limit: TOTAL_LIMIT)) if siblings.count >= TOTAL_LIMIT
  end

  def validate_daily_limit
    return unless scheduled_at.present? && (new_record? || scheduled_at_changed?)

    errors.add(:base, I18n.t('scheduled_statuses.over_daily_limit', limit: DAILY_LIMIT)) if siblings.where('scheduled_at::date = ?::date', scheduled_at).count >= DAILY_LIMIT
  end

  # Other scheduled statuses of the same account. Excluding self matters when
  # editing an existing scheduled status while sitting at the limit.
  def siblings
    persisted? ? account.scheduled_statuses.where.not(id: id) : account.scheduled_statuses
  end

  def enqueue_publishing
    return if failed_at.present? || scheduled_at.blank?

    PublishScheduledStatusWorker.perform_at(scheduled_at, id)
  end
end
