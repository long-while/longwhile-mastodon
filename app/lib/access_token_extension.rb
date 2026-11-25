# frozen_string_literal: true

module AccessTokenExtension
  extend ActiveSupport::Concern

  NOT_LONG_LIVED_REFRESH_SQL = <<~SQL.squish
    NOT (oauth_access_tokens.long_lived AND oauth_access_tokens.purpose IS NOT DISTINCT FROM 'multi_account_refresh')
  SQL

  included do
    include Redisable

    has_many :web_push_subscriptions, class_name: 'Web::PushSubscription', inverse_of: :access_token

    after_commit :push_to_streaming_api

    scope :expired,
          lambda {
            where.not(expires_in: nil)
              .where('created_at + MAKE_INTERVAL(secs => expires_in) < NOW()')
              .where(NOT_LONG_LIVED_REFRESH_SQL)
          }
    scope :not_revoked, -> { where(revoked_at: nil) }
    scope :revoked, -> { where.not(revoked_at: nil).where(revoked_at: ...Time.now.utc) }
    scope :multi_account, -> { where(multi_account: true) }
    scope :non_multi_account, -> { where(multi_account: [false, nil]) }
    scope :long_lived_refresh, -> { where(long_lived: true, purpose: 'multi_account_refresh') }
    scope :excluding_long_lived_refresh, -> { where(NOT_LONG_LIVED_REFRESH_SQL) }

    scope :multi_account_owned,
          lambda {
            owned = where(multi_account: true).or(where(long_lived: true))
            application_id = MultiAccountConfig.application_id
            application_id ? owned.or(where(application_id: application_id)) : owned
          }
  end

  def expired?(*args)
    return false if long_lived_refresh?

    super
  end

  def long_lived_refresh?
    long_lived && purpose == 'multi_account_refresh'
  end

  def revoke(clock = Time)
    update(revoked_at: clock.now.utc)
  end

  def update_last_used(request, clock = Time)
    update(last_used_at: clock.now.utc, last_used_ip: request.remote_ip)
  end

  def push_to_streaming_api
    redis.publish("timeline:access_token:#{id}", { event: :kill }.to_json) if revoked? || destroyed?
  end
end
