# frozen_string_literal: true

class RateLimiter
  include Redisable

  FAMILIES = {
    follows: {
      limit: 400,
      period: 24.hours.freeze,
    }.freeze,

    statuses: {
      limit: 300,
      period: 3.hours.freeze,
    }.freeze,

    # @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
    #   채팅은 짧은 메시지를 자주 보낸다. 전역 statuses 제한(300/3시간)으로는 쓸 수
    #   없다. 전역을 올리면 공개 글 스팸까지 함께 풀리므로 DM 만 별도 family 로
    #   분리한다. Status#rate_limiter 가 direct 일 때 이 family 로 갈아끼운다.
    #   근거: dm-chat-phase-0.md P0-3, dm-chat-decisions.md D-09
    #   ENV 오타로 0 이 들어가면 DM 이 전부 막히므로 하한을 둔다.
    direct_statuses: {
      limit: [(ENV['DM_RATE_LIMIT'] || 1000).to_i, 1].max,
      period: [(ENV['DM_RATE_LIMIT_PERIOD'] || 3600).to_i, 60].max.seconds.freeze,
    }.freeze,

    reports: {
      limit: 400,
      period: 24.hours.freeze,
    }.freeze,

    multi_account_refresh: {
      limit: 10,
      period: 1.minute.freeze,
    }.freeze,
  }.freeze

  def initialize(by, options = {})
    @by     = by
    @family = options[:family]
    @limit  = FAMILIES[@family][:limit]
    @period = FAMILIES[@family][:period].to_i
  end

  def record!
    count = redis.get(key)

    if count.nil?
      redis.set(key, 0)
      redis.expire(key, (@period - (last_epoch_time % @period) + 1).to_i)
    end

    raise Mastodon::RateLimitExceededError if count.present? && count.to_i >= @limit

    redis.incr(key)
  end

  def rollback!
    redis.decr(key)
  end

  def to_headers(now = Time.now.utc)
    {
      'X-RateLimit-Limit' => @limit.to_s,
      'X-RateLimit-Remaining' => (@limit - (redis.get(key) || 0).to_i).to_s,
      'X-RateLimit-Reset' => (now + (@period - (now.to_i % @period))).iso8601(6),
    }
  end

  private

  def key
    @key ||= "rate_limit:#{@by.id}:#{@family}:#{(last_epoch_time / @period).to_i}"
  end

  def last_epoch_time
    @last_epoch_time ||= Time.now.to_i
  end
end
