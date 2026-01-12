# frozen_string_literal: true

require 'digest'

module MultiAccounts
  class Rollout
    class << self
      def should_enable_for_user?(user)
        return false unless MultiAccountConfig.refresh_flow_enabled?

        # Internal users list (can be configured via environment variable)
        internal_user_ids = ENV.fetch('MA_INTERNAL_USER_IDS', '').split(',').map(&:strip).reject(&:blank?)
        return true if internal_user_ids.include?(user.id.to_s)

        # Percentage-based rollout (0-100)
        rollout_percentage = ENV.fetch('MA_ROLLOUT_PERCENTAGE', '100').to_i
        return false if rollout_percentage.zero?

        # Hash user ID to get consistent assignment
        user_hash = Digest::MD5.hexdigest(user.id.to_s).to_i(16)
        assigned_percentage = (user_hash % 100) + 1

        assigned_percentage <= rollout_percentage
      end

      def enabled_user_ids
        return [] unless MultiAccountConfig.refresh_flow_enabled?

        internal_user_ids = ENV.fetch('MA_INTERNAL_USER_IDS', '').split(',').map(&:strip).reject(&:blank?)
        return internal_user_ids.map(&:to_i) if internal_user_ids.any?

        # For percentage rollout, we'd need to query all users and filter
        # This is expensive, so we only return internal users for now
        []
      end
    end
  end
end

