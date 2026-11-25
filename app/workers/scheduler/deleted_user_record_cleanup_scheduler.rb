# frozen_string_literal: true

class Scheduler::DeletedUserRecordCleanupScheduler
  include Sidekiq::Worker

  sidekiq_options retry: 0, lock: :until_executed, lock_ttl: 1.day.to_i

  def perform
    DeletedUserRecord.expired.in_batches do |batch|
      DeletedUserIp.where(deleted_user_record_id: batch.select(:id)).delete_all
      batch.delete_all
    end
  end
end
