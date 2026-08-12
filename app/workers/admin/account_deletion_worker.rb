# frozen_string_literal: true

class Admin::AccountDeletionWorker
  include Sidekiq::Worker

  sidekiq_options queue: 'pull', lock: :until_executed, lock_ttl: 1.week.to_i

  # `preserve_content` keeps the account's posts and anonymises their author.
  # It is opt-in per call: a moderator deleting an account by hand usually wants
  # the threads it took part in to stay readable, while the scheduled cleanup of
  # a suspension is the moderation action finishing its job and must still take
  # the content with it.
  def perform(account_id, options = {})
    preserve_content = options.with_indifferent_access.fetch(:preserve_content, false)

    DeleteAccountService.new.call(Account.find(account_id), reserve_username: true, reserve_email: true, preserve_content: preserve_content)
  rescue ActiveRecord::RecordNotFound
    true
  end
end
