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
    account = Account.find(account_id)
    # 상류 4.6 의 보안 수정: 정지(unavailable)되지 않은 계정은 지우지 않는다.
    return unless account.unavailable?

    service_options = { reserve_username: true, reserve_email: true, preserve_content: preserve_content }
    # 상류 4.7.3: 정지로 지운 계정이 "자기 삭제" 로 표시되지 않게 정지 시각을 넘긴다.
    # 익명화는 정지를 풀고 글을 남기는 것이라 넘기지 않는다.
    service_options[:suspended_at] = account.suspended_at unless preserve_content

    DeleteAccountService.new.call(account, **service_options)
  rescue ActiveRecord::RecordNotFound
    true
  end
end
