# frozen_string_literal: true

class PublishScheduledStatusWorker
  include Sidekiq::Worker

  # NOTE: deliberately *not* using `lock: :until_executed`. A unique lock keyed
  # on the record id would swallow the re-enqueue that happens when a user moves
  # a scheduled status earlier in time, leaving it pending until the original
  # (now stale) job fires. Duplicate protection is done in the database instead,
  # via ScheduledStatus#claim_for_publishing!.
  sidekiq_options retry: 3

  # Anything still failing after the retries is the post's own problem, so it
  # gets surfaced to its author rather than disappearing into the log.
  sidekiq_retries_exhausted do |msg, exception|
    ScheduledStatus.find_by(id: msg['args'].first)&.record_failure!(exception&.message)
  end

  # Grace period for clock skew between the web process and the worker.
  TIMING_TOLERANCE = 30.seconds

  def perform(scheduled_status_id)
    scheduled_status = ScheduledStatus.find_by(id: scheduled_status_id)

    # Already published, or deleted by the user.
    return true if scheduled_status.nil?

    # Should not happen through the API, but the column is nullable and a record
    # without a time must never be published.
    return true if scheduled_status.scheduled_at.nil?

    # The publication time was moved back after this job had been enqueued.
    # Discard it; the after_commit hook has already queued a job for the new
    # time, and the periodic scheduler is a second safety net.
    return true if scheduled_status.scheduled_at > Time.now.utc + TIMING_TOLERANCE

    if scheduled_status.account.user.nil? || scheduled_status.account.user.disabled?
      scheduled_status.destroy!
      return true
    end

    # Another job for the same record got here first.
    return true unless scheduled_status.claim_for_publishing!

    publish!(scheduled_status)
  end

  def options_with_objects(options)
    options.tap do |options_hash|
      options_hash[:application] = Doorkeeper::Application.find(options_hash.delete(:application_id)) if options[:application_id]
      options_hash[:thread]      = Status.find(options_hash.delete(:in_reply_to_id)) if options_hash[:in_reply_to_id]
    end
  end

  private

  def publish!(scheduled_status)
    PostStatusService.new.call(
      scheduled_status.account,
      options_with_objects(scheduled_status.params.with_indifferent_access)
        # A deterministic key makes a Sidekiq retry return the status that the
        # previous attempt already created instead of posting it twice. Without
        # it, an error raised after the status was saved (during hashtag
        # processing or distribution, say) would duplicate the post on retry.
        .merge(idempotency: idempotency_key(scheduled_status))
    )

    # Only drop the record once the status actually exists, so a failure leaves
    # something the user can see and retry.
    scheduled_status.destroy!
  rescue ActiveRecord::RecordNotFound
    # The post being replied to, or a referenced application, is gone.
    scheduled_status.record_failure!(I18n.t('scheduled_statuses.failures.missing_reference'))
  rescue ActiveRecord::RecordInvalid, Mastodon::ValidationError => e
    scheduled_status.record_failure!(e.message)
  rescue
    # Unexpected and possibly transient. Hand the claim back so the Sidekiq
    # retry can actually act on the record — holding it would make the retry
    # exit as "someone else is on it" and lose the post silently.
    scheduled_status.release_claim!
    raise
  end

  def idempotency_key(scheduled_status)
    "scheduled:#{scheduled_status.id}"
  end
end
