# frozen_string_literal: true

class Scheduler::ScheduledStatusesScheduler
  include Sidekiq::Worker

  sidekiq_options retry: 0, lock: :until_executed, lock_ttl: 1.hour.to_i

  def perform
    publish_scheduled_statuses!
    publish_scheduled_announcements!
    unpublish_expired_announcements!
  end

  private

  def publish_scheduled_statuses!
    due_statuses.find_each do |scheduled_status|
      PublishScheduledStatusWorker.perform_at(scheduled_status.scheduled_at, scheduled_status.id)
    end
  end

  # Records are normally enqueued precisely by ScheduledStatus's after_commit
  # hook. This sweep only picks up the ones whose job was lost (Redis flushed,
  # created before this feature shipped, or the worker died mid-flight), so it
  # skips records that already failed or are currently being published.
  def due_statuses
    ScheduledStatus
      .publishable
      .where(scheduled_at: ..time_due_at)
      .where('publishing_at IS NULL OR publishing_at < ?', ScheduledStatus::STALE_CLAIM_AFTER.ago)
  end

  def publish_scheduled_announcements!
    due_announcements.find_each do |announcement|
      PublishScheduledAnnouncementWorker.perform_at(announcement.scheduled_at, announcement.id)
    end
  end

  def due_announcements
    Announcement.unpublished.where('scheduled_at IS NOT NULL AND scheduled_at <= ?', time_due_at)
  end

  def unpublish_expired_announcements!
    expired_announcements.in_batches.update_all(published: false, scheduled_at: nil)
  end

  def expired_announcements
    Announcement.published.where('ends_at IS NOT NULL AND ends_at <= ?', Time.now.utc)
  end

  def time_due_at
    Time.now.utc + ScheduledStatus::SWEEP_WINDOW
  end
end
