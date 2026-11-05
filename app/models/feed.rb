# frozen_string_literal: true

class Feed
  include Redisable

  def initialize(type, id)
    @type = type
    @id   = id
  end

  def get(limit, max_id = nil, since_id = nil, min_id = nil)
    limit    = limit.to_i
    max_id   = max_id.to_i if max_id.present?
    since_id = since_id.to_i if since_id.present?
    min_id   = min_id.to_i if min_id.present?

    from_redis(limit, max_id, since_id, min_id)
  end

  protected

  def from_redis(limit, max_id, since_id, min_id)
    max_id = '+inf' if max_id.blank?
    if min_id.blank?
      since_id   = '-inf' if since_id.blank?
      unhydrated = redis.zrevrangebyscore(key, "(#{max_id}", "(#{since_id}", limit: [0, limit], with_scores: true).map { |id| id.first.to_i }
    else
      unhydrated = redis.zrangebyscore(key, "(#{min_id}", "(#{max_id}", limit: [0, limit], with_scores: true).map { |id| id.first.to_i }
    end

    # @_longwhile — DM 은 타임라인에서 보지 않는다. 팬아웃 쪽에서 이미 막지만,
    # **이 기능이 켜지기 전에 들어간 항목이 Redis 에 그대로 남아 있다.** 읽을 때
    # 한 번 더 거른다 — 지우려면 전 계정 피드를 다시 만들어야 한다.
    Status.where(id: unhydrated).where.not(visibility: :direct)
  end

  def key
    FeedManager.instance.key(@type, @id)
  end
end
