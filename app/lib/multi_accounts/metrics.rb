# frozen_string_literal: true

module MultiAccounts
  class Metrics
    include Redisable

    METRIC_KEYS = {
      switch_duration: 'multi_account:metrics:switch_duration',
      switch_success: 'multi_account:metrics:switch_success',
      switch_failure: 'multi_account:metrics:switch_failure',
      refresh_duration: 'multi_account:metrics:refresh_duration',
      refresh_success: 'multi_account:metrics:refresh_success',
      refresh_failure: 'multi_account:metrics:refresh_failure',
    }.freeze

    class << self
      def record_switch_duration(duration_ms:)
        new.record_duration(METRIC_KEYS[:switch_duration], duration_ms)
      end

      def record_switch_success
        new.record_counter(METRIC_KEYS[:switch_success])
      end

      def record_switch_failure
        new.record_counter(METRIC_KEYS[:switch_failure])
      end

      def record_refresh_duration(duration_ms:)
        new.record_duration(METRIC_KEYS[:refresh_duration], duration_ms)
      end

      def record_refresh_success
        new.record_counter(METRIC_KEYS[:refresh_success])
      end

      def record_refresh_failure
        new.record_counter(METRIC_KEYS[:refresh_failure])
      end

      def get_switch_success_rate(period: 1.hour)
        new.get_success_rate(
          METRIC_KEYS[:switch_success],
          METRIC_KEYS[:switch_failure],
          period,
        )
      end

      def get_refresh_success_rate(period: 1.hour)
        new.get_success_rate(
          METRIC_KEYS[:refresh_success],
          METRIC_KEYS[:refresh_failure],
          period,
        )
      end
    end

    def record_duration(key, duration_ms)
      redis.lpush(key, duration_ms)
      redis.ltrim(key, 0, 999) # Keep last 1000 samples
      redis.expire(key, 7.days.to_i)
    end

    def record_counter(key)
      redis.incr(key)
      redis.expire(key, 7.days.to_i)
    end

    def get_success_rate(success_key, failure_key, _period)
      # Note: period parameter is kept for future time-windowed implementation
      # For now, we use simple counters
      success_count = redis.get(success_key)&.to_i || 0
      failure_count = redis.get(failure_key)&.to_i || 0
      total = success_count + failure_count

      return 0.0 if total.zero?

      (success_count.to_f / total * 100).round(2)
    end
  end
end

