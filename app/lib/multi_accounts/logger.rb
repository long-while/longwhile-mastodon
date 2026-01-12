# frozen_string_literal: true

module MultiAccounts
  class Logger
    class << self
      def log_account_switch(user_id:, target_account_id:, success:, reason: nil, latency_ms: nil)
        log_data = {
          event: 'multi_account_switch',
          user_id: user_id,
          target_account_id: target_account_id,
          success: success,
          timestamp: Time.now.utc.iso8601,
        }

        log_data[:reason] = reason if reason
        log_data[:latency_ms] = latency_ms if latency_ms

        if success
          Rails.logger.info("[MultiAccount] Account switch successful: #{log_data.to_json}")
        else
          Rails.logger.warn("[MultiAccount] Account switch failed: #{log_data.to_json}")
        end

        log_data
      end

      def log_refresh_failure(refresh_token_id:, error:, user_id: nil)
        log_data = {
          event: 'multi_account_refresh_failure',
          refresh_token_id: refresh_token_id,
          error: error.is_a?(Exception) ? error.message : error.to_s,
          timestamp: Time.now.utc.iso8601,
        }

        log_data[:user_id] = user_id if user_id

        Rails.logger.error("[MultiAccount] Refresh failure: #{log_data.to_json}")

        # Send to Sentry if available
        if defined?(Sentry) && error.is_a?(Exception)
          Sentry.capture_exception(error, extra: log_data)
        end

        log_data
      end

      def log_refresh_success(refresh_token_id:, user_id:, latency_ms: nil)
        log_data = {
          event: 'multi_account_refresh_success',
          refresh_token_id: refresh_token_id,
          user_id: user_id,
          timestamp: Time.now.utc.iso8601,
        }

        log_data[:latency_ms] = latency_ms if latency_ms

        Rails.logger.info("[MultiAccount] Refresh successful: #{log_data.to_json}")

        log_data
      end
    end
  end
end

