# frozen_string_literal: true

module MultiAccounts
  class StateStore
    KEY_PREFIX = 'multi_account:state:'
    TTL = 15.minutes
    FAILURE_TTL = 1.minute

    class InvalidStateError < StandardError; end

    class << self
      def store!(state:, nonce:, user_id:, redirect_uri:)
        data = {
          nonce: nonce,
          user_id: user_id,
          redirect_uri: redirect_uri,
          created_at: Time.now.utc.iso8601,
          force_login_performed: false,
        }
        redis.setex("#{KEY_PREFIX}#{state}", TTL.to_i, data.to_json)
      end

      def fetch(state)
        raw = redis.get("#{KEY_PREFIX}#{state}")
        return nil if raw.blank?

        JSON.parse(raw).with_indifferent_access
      end

      def consume!(state, nonce)
        data = fetch(state)

        if data.blank? || data[:nonce] != nonce
          # Set a short TTL to prevent rapid retry attacks
          redis.expire("#{KEY_PREFIX}#{state}", FAILURE_TTL.to_i) if data.present?
          raise InvalidStateError, 'Invalid state or nonce'
        end

        redis.del("#{KEY_PREFIX}#{state}")
        data
      rescue InvalidStateError
        raise
      end

      def mark_force_login!(state)
        key = "#{KEY_PREFIX}#{state}"
        raw = redis.get(key)
        return nil if raw.blank?

        ttl = redis.ttl(key)
        ttl = TTL.to_i if ttl.nil? || ttl.negative?

        data = JSON.parse(raw)
        data['force_login_performed'] = true
        redis.setex(key, ttl, data.to_json)

        data.with_indifferent_access
      end

      private

      def redis
        Redis.current
      end
    end
  end
end
