# frozen_string_literal: true

module MultiAccounts
  class RefreshService
    # 전환으로 발급한 세션 토큰의 표식. 갱신 토큰('multi_account_refresh')과
    # 반드시 구분돼야 한다.
    SESSION_TOKEN_PURPOSE = 'multi_account_session'

    # 세션 토큰의 수명. 페이지는 전환 직후 verify_credentials 한 번만 이 토큰으로 부르고
    # 곧바로 새로고침해 새 세션의 토큰으로 바꿔 탄다. 이 토큰은 세션과 묶여 있지 않아
    # 로그아웃해도 폐기되지 않으므로, 만료가 없으면 전환할 때마다 영원히 사는 토큰이
    # 하나씩 쌓인다. 느린 회선을 감안해도 한 시간이면 넉넉하다.
    SESSION_TOKEN_TTL = 1.hour

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

        # 정지·비활성 계정이 다중 계정 토큰으로 웹 세션을 획득하는 것을 차단한다. `suspended?`
        # 가 아니라 `unavailable?` 다 — 4.7 의 자기 삭제(`mark_deleted!`)는 정지가 아니다.
        # 추모 계정은 Devise(`active_for_authentication?`)가 sign_in 에서 던져 버리는데, 컨트롤러는
        # 그때 이미 `reset_session` 을 했으므로 지금 계정까지 로그아웃된다. 여기서 먼저 막는다.
        raise Error.new('Account is suspended or disabled', status: 403) if user.disabled? || account.unavailable? || !user.active_for_authentication?

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

    # ═════════════════════════════════════════════════════════════════════════
    # @_longwhile custom feature / 한참(longwhile) 제작 기능 — 계정 전환 토큰 자동 업그레이드
    # 이 기능을 사용·재사용하려면 서버 내에 아래 출처를 반드시 표기해야 합니다.
    # If you use or reuse this feature, you must credit the author on your server.
    #   Twitter/X : @_longwhile  ·  https://twitter.com/_longwhile
    #   Crepe     : https://kre.pe/QTRx
    # ═════════════════════════════════════════════════════════════════════════
    def ensure_refresh_token_valid!(token)
      raise Error.new('Invalid refresh token', status: 401) unless token
      raise Error.new('Refresh token has been revoked', status: 401) if token.revoked?

      return if token.long_lived_refresh?

      # @_longwhile — **전환으로 나간 세션 토큰은 다시 전환에 못 쓴다.**
      #   `create_session_token` 이 만드는 토큰은 다중 계정 앱 소유에
      #   `multi_account: true` 라, 표식이 없으면 아래 자동 승격에 그대로 걸려
      #   **10년짜리 갱신 토큰으로 올라간다.** `revoke_access!` 는
      #   `excluding_long_lived_refresh` 로 그런 토큰을 건너뛰므로, 한번 올라가면
      #   로그아웃해도 안 지워진다. 전환할 때마다 하나씩 쌓이는 토큰이라
      #   반드시 막아야 한다.
      raise Error.new('Token is not a valid multi-account refresh token', status: 422) if token.try(:purpose) == SESSION_TOKEN_PURPOSE

      # 구버전에서 생성된 토큰은 long_lived/purpose 플래그 없이 존재할 수 있다.
      #
      # @_longwhile — 판단 기준은 **발급한 앱**뿐이다. 예전에는
      #   `token.multi_account` 가 참이기만 해도 승격시켰는데, 그 플래그는
      #   **이 기능과 함께 생겼기 때문에 정작 옛 토큰에는 없다.** 쓸모가
      #   없으면서, 다른 앱이 발급한 `multi_account` 토큰까지 승격시켜
      #   `spec/services/multi_accounts/refresh_service_spec.rb` 의
      #   "not long-lived → 422" 가 조용히 깨져 있었다.
      ma_client_id = Rails.configuration.x.multi_account[:client_id].presence
      ma_application_id = ma_client_id && Doorkeeper::Application.find_by(uid: ma_client_id)&.id

      raise Error.new('Token is not a valid multi-account refresh token', status: 422) unless ma_application_id && token.application_id == ma_application_id

      Rails.logger.info("[MultiAccount] Auto-upgrading token #{token.id} to long_lived_refresh (app_id=#{token.application_id})")
      token.update!(long_lived: true, purpose: 'multi_account_refresh', multi_account: true)
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

    # 전환 직후 페이지가 들고 갈 **세션 토큰**이다. 갱신 토큰과 구별되도록
    # `purpose` 를 박아 둔다 — `ensure_refresh_token_valid!` 가 이걸 보고 돌려보낸다.
    def create_session_token(refresh_token)
      Doorkeeper::AccessToken.create!(
        application: refresh_token.application,
        resource_owner_id: refresh_token.resource_owner_id,
        scopes: refresh_token.scopes.to_s,
        expires_in: SESSION_TOKEN_TTL.to_i,
        multi_account: true,
        purpose: SESSION_TOKEN_PURPOSE
      )
    end
  end
end

