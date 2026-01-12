# frozen_string_literal: true

module MultiAccounts
  class RefreshService
    Result = Struct.new(:access_token, :account, :user, keyword_init: true)

    class Error < StandardError
      attr_reader :status

      def initialize(message, status:)
        super(message)
        @status = status
      end
    end

    def initialize(refresh_token:, request:)
      @refresh_token_value = refresh_token
      @request = request
    end

    def call
      start_time = Time.now
      user_id = nil
      refresh_token_id = nil

      begin
        raise Error.new('refresh_token is required', status: 400) if refresh_token_value.blank?

        token = find_refresh_token
        ensure_refresh_token_valid!(token)

        refresh_token_id = token.id
        resource_owner = find_resource_owner(token)
        user = if resource_owner.is_a?(User)
                 resource_owner
               elsif resource_owner.respond_to?(:account)
                 resource_owner.account&.user
               end
        user_id = user&.id
        account = account_for(token, resource_owner)
        raise Error.new('Account not found', status: 404) unless account
        raise Error.new('User not found', status: 404) unless user

        limiter = nil
        limiter = RateLimiter.new(resource_owner, family: :multi_account_refresh)
        limiter.record!

        begin
          token.update_last_used(request)
          access_token = create_session_token(token)
          access_token.update_last_used(request)

          latency_ms = ((Time.now - start_time) * 1000).round
          MultiAccounts::Logger.log_refresh_success(
            refresh_token_id: refresh_token_id,
            user_id: user_id,
            latency_ms: latency_ms,
          )
          MultiAccounts::Metrics.record_refresh_success
          MultiAccounts::Metrics.record_refresh_duration(duration_ms: latency_ms)

          Result.new(access_token: access_token, account: account, user: user)
        ensure
          limiter&.rollback! if $ERROR_INFO
        end
      rescue Mastodon::RateLimitExceededError => e
        MultiAccounts::Logger.log_refresh_failure(
          refresh_token_id: refresh_token_id,
          error: e,
          user_id: user_id,
        )
        MultiAccounts::Metrics.record_refresh_failure
        raise Error.new('Too many requests', status: 429)
      rescue Error => e
        MultiAccounts::Logger.log_refresh_failure(
          refresh_token_id: refresh_token_id,
          error: e,
          user_id: user_id,
        )
        MultiAccounts::Metrics.record_refresh_failure
        raise
      rescue StandardError => e
        MultiAccounts::Logger.log_refresh_failure(
          refresh_token_id: refresh_token_id,
          error: e,
          user_id: user_id,
        )
        MultiAccounts::Metrics.record_refresh_failure
        raise Error.new('Internal server error', status: 500)
      end
    end

    private

    attr_reader :refresh_token_value, :request

    def find_refresh_token
      Doorkeeper::AccessToken.by_token(refresh_token_value)
    end

    def ensure_refresh_token_valid!(token)
      raise Error.new('Invalid refresh token', status: 401) unless token
      raise Error.new('Refresh token has been revoked', status: 401) if token.revoked?
      raise Error.new('Token is not long-lived', status: 422) unless token.long_lived_refresh?
    end

    def find_resource_owner(token)
      if Doorkeeper.config.polymorphic_resource_owner?
        token.resource_owner
      else
        User.find_by(id: token.resource_owner_id)
      end
    end

    def account_for(token, resource_owner)
      return unless resource_owner

      if resource_owner.respond_to?(:account) && resource_owner.account
        resource_owner.account
      elsif resource_owner.is_a?(Account)
        resource_owner
      else
        Account.find_by(id: token.resource_owner_id)
      end
    end

    def create_session_token(refresh_token)
      Doorkeeper::AccessToken.create!(
        application: refresh_token.application,
        resource_owner_id: refresh_token.resource_owner_id,
        scopes: refresh_token.scopes.to_s,
        multi_account: true
      )
    end
  end
end

