# frozen_string_literal: true

class Api::V1::MultiAccountsController < Api::BaseController
  include Api::MultiAccountResponse

  # 전환에 쓸 수 있는 장기 토큰의 기본 스코프. 호출자가 더 좁은 토큰을 들고 있으면
  # 그쪽을 따른다 — 여기서 권한을 넓혀 주지 않는다.
  DEFAULT_REFRESH_SCOPES = 'read write follow'

  # 재사용할 토큰을 찾을 때 훑어볼 최대 개수. 스코프 문자열은 순서가 다를 수 있어
  # SQL 로 정확히 맞추기 어려우므로 최근 것부터 몇 개만 꺼내 루비에서 비교한다.
  REUSABLE_TOKEN_LOOKUP_LIMIT = 20

  # 다중 계정 consume 엔드포인트는 팝업에서 이미 인증된 authorization code를 처리하므로
  # 별도의 doorkeeper 인증이나 로그인 세션을 요구하지 않는다.
  skip_before_action :require_authenticated_user!, only: [:consume]
  skip_before_action :require_not_suspended!, only: [:consume]

  # @_longwhile — 콜백 이름을 `require_authenticated_user!` 로 재사용하면 안 된다.
  #   Rails 의 콜백 체인은 **같은 심볼 필터를 중복으로 보고 앞의 것을 지우므로**,
  #   그렇게 적으면 `Api::BaseController` 의 조건부 등록을 통째로 대체해 버린다.
  before_action :require_refresh_token_caller!, only: [:refresh_token]

  def consume
    # NOTE: never log raw params here — payload contains the OAuth authorization_code,
    # state and nonce, all of which are live credentials.
    Rails.logger.debug { 'MultiAccountsController#consume called' }

    # NOTE: :code_verifier는 현재 프론트가 PKCE를 쓰지 않아 항상 비어 있지만,
    # 아래 토큰 교환에서 참조하므로 향후 PKCE 도입 시 동작하도록 permit에 포함해 둔다.
    payload_params = params.require(:payload).permit(:state, :nonce, :authorization_code, :code_verifier)

    # Verify and consume state from Redis
    MultiAccounts::StateStore.consume!(
      payload_params[:state],
      payload_params[:nonce]
    )

    # Exchange authorization code for access token
    config = Rails.configuration.x.multi_account
    application = Doorkeeper::Application.find_by(uid: config[:client_id])

    unless application
      render json: { error: 'Multi-account OAuth application not found' }, status: 500
      return
    end

    client = Doorkeeper::OAuth::Client.new(application)
    grant = Doorkeeper.config.access_grant_model.by_token(payload_params[:authorization_code])

    unless grant
      render json: { error: '인증 코드를 찾을 수 없거나 이미 사용되었습니다.' }, status: 401
      return
    end

    unless grant.application_id == application.id
      render json: { error: '인증 코드가 OAuth 애플리케이션과 일치하지 않습니다.' }, status: 401
      return
    end

    authorization_request = Doorkeeper::OAuth::AuthorizationCodeRequest.new(
      Doorkeeper.config,
      grant,
      client,
      {
        redirect_uri: config[:redirect_uri],
        code_verifier: payload_params[:code_verifier],
      }.compact
    )

    token_response = authorization_request.authorize

    if token_response.is_a?(Doorkeeper::OAuth::ErrorResponse)
      error_body = token_response.body
      error_message = error_body[:error_description] || error_body[:error] || '인증 코드를 토큰으로 교환하는데 실패했습니다. 다시 시도해주세요.'
      Rails.logger.warn("Multi-account token exchange failed: #{error_message}")
      render json: { error: error_message }, status: token_response.status == :unauthorized ? :unauthorized : :bad_request
      return
    end

    access_token = token_response.token
    begin
      updates = {}
      updates[:multi_account] = true if access_token.respond_to?(:multi_account=)
      # 장기 갱신 토큰(10년, 로그아웃해도 안 지워진다)으로 올리는 것은 갱신 흐름이 켜져 있을
      # 때뿐이다. 꺼져 있으면 /session/refresh 가 403 이라 쓸 곳이 없는 토큰만 남는다.
      if MultiAccountConfig.refresh_flow_enabled?
        updates[:purpose] = 'multi_account_refresh' if access_token.respond_to?(:purpose=)
        updates[:long_lived] = true if access_token.respond_to?(:long_lived=)
      end
      access_token.update!(updates) if updates.present?
      Rails.logger.info("[MultiAccount] Token #{access_token.id} marked: multi_account=#{access_token.try(:multi_account)}, long_lived=#{access_token.try(:long_lived)}, purpose=#{access_token.try(:purpose)}")
    rescue => e
      Rails.logger.error("[MultiAccount] CRITICAL: Failed to mark token #{access_token&.id} with multi-account flags: #{e.message}")
      Rails.logger.error(e.backtrace&.first(5)&.join("\n"))
    end

    resource_owner =
      if Doorkeeper.config.polymorphic_resource_owner?
        access_token.resource_owner
      else
        User.find_by(id: access_token.resource_owner_id)
      end

    unless resource_owner
      render json: { error: '계정을 찾을 수 없습니다.' }, status: 404
      return
    end

    account =
      if resource_owner.respond_to?(:account) && resource_owner.account
        resource_owner.account
      elsif resource_owner.is_a?(Account)
        resource_owner
      else
        Account.find_by(id: access_token.resource_owner_id)
      end

    unless account
      render json: { error: '계정을 찾을 수 없습니다.' }, status: 404
      return
    end

    render json: {
      token: access_token.token,
      account: self_account_json(account),
      scope: access_token.scopes.to_s,
      expires_at: access_token.expires_at&.iso8601,
      state: payload_params[:state],
      nonce: payload_params[:nonce],
    }
  rescue MultiAccounts::StateStore::InvalidStateError => e
    Rails.logger.warn("Multi-account invalid state error: #{e.message}")
    render json: { error: e.message }, status: 401
  rescue ActionController::ParameterMissing => e
    render json: { error: "필수 파라미터 누락: #{e.param}" }, status: 400
  rescue ActiveRecord::RecordNotFound => e
    Rails.logger.error("Multi-account consume error: #{e.message}")
    render json: { error: '계정을 찾을 수 없습니다.' }, status: 404
  rescue => e
    Rails.logger.error("Multi-account consume error: #{e.message}")
    Rails.logger.error(e.backtrace.join("\n"))
    render json: { error: '계정을 추가 중 오류가 발생했습니다. 다시 시도해주세요.' }, status: 500
  end

  # ═════════════════════════════════════════════════════════════════════════
  # @_longwhile — **계정 전환에 쓸 수 있는 토큰을 내주는 유일한 곳.**
  #
  #   페이지의 세션 토큰(`meta.access_token`)은 `SessionActivation` 이 웹
  #   superapp 으로 만든 것이라 `long_lived`·`purpose`·`multi_account` 가 전부
  #   비어 있고, `MultiAccounts::RefreshService#ensure_refresh_token_valid!` 가
  #   **422** 로 막는다. 프런트가 저장해 두는 토큰은 반드시 여기서 나와야 한다.
  # ═════════════════════════════════════════════════════════════════════════
  def refresh_token
    application = multi_account_application

    unless application
      Rails.logger.error('Multi-account application not found for refresh_token')
      render json: { error: 'Multi-account application not found' }, status: 404
      return
    end

    # Do not grant more than the caller already holds: derive the scopes from the
    # caller's bearer token when present so an API client cannot escalate a read-only
    # token into read/write/follow. Session-authenticated callers (no doorkeeper_token)
    # are already fully trusted and fall back to the default multi-account scopes.
    requested_scopes = doorkeeper_token&.scopes&.to_s.presence || DEFAULT_REFRESH_SCOPES

    token = reusable_refresh_token(application, requested_scopes) ||
            create_refresh_token!(application, requested_scopes)

    render json: {
      token: token.token,
      account: self_account_json(current_user.account),
      scope: token.scopes.to_s,
      expires_at: token.expires_in ? (token.created_at + token.expires_in).iso8601 : nil,
    }
  rescue => e
    Rails.logger.error("Multi-account token refresh failed: #{e.message}")
    Rails.logger.error(e.backtrace.join("\n"))
    render json: { error: '토큰을 갱신하는 중 오류가 발생했습니다.' }, status: 500
  end

  private

  def multi_account_application
    client_id = Rails.configuration.x.multi_account[:client_id]
    return if client_id.blank?

    Doorkeeper::Application.find_by(uid: client_id)
  end

  # @_longwhile — 이 엔드포인트는 **10년짜리 토큰**을 내준다. 두 가지를 막는다.
  #
  #   1. **비로그인.** `Api::BaseController` 의
  #      `require_authenticated_user!` 는 `disallow_unauthenticated_api_access?`
  #      일 때만 걸린다. 그래서 보통의 인스턴스에서는 로그인하지 않고도
  #      여기까지 들어왔고, `current_user.id` 가 nil 에서 터져 500 이 났다.
  #   2. **서드파티 앱.** 그 앱의 토큰으로 부를 수 있으면, 사용자가 나중에
  #      그 앱을 해지해도 여기서 나온 토큰은 **다중 계정 앱 소유**라 살아남는다.
  #
  #   통과시키는 셋:
  #     · doorkeeper 토큰 없음 = 세션 인증(웹에서 직접 부른 경우)
  #     · superapp 토큰 = 페이지가 들고 있는 세션 토큰
  #     · multi_account 토큰 = 계정 전환 직후 잠깐 깔려 있는 세션 토큰
  def require_refresh_token_caller!
    unless current_user
      render json: { error: 'This method requires an authenticated user' }, status: 401
      return
    end

    return if doorkeeper_token.nil?
    return if doorkeeper_token.application&.superapp?
    return if doorkeeper_token.try(:multi_account)

    render json: { error: 'This endpoint is only available to the web interface' }, status: 403
  end

  # @_longwhile — **이미 있는 장기 토큰을 다시 쓴다.**
  #   예전에는 부를 때마다 10년짜리 토큰을 새로 만들었다. 전환기는 저장된 토큰이
  #   없을 때마다(브라우저를 바꾸거나 시크릿 창을 쓰거나 저장소를 비울 때마다)
  #   이걸 부르므로, 폐기되지 않는 토큰이 끝없이 쌓였다 — `User#revoke_access!` 가
  #   `excluding_long_lived_refresh` 로 일부러 건너뛰기 때문에 **로그아웃해도
  #   남는다.** 같은 (사용자 · 앱 · 스코프) 조합이면 있는 것을 돌려준다.
  def reusable_refresh_token(application, scopes)
    wanted = scopes.to_s.split.sort

    Doorkeeper::AccessToken
      .long_lived_refresh
      .not_revoked
      .where(application_id: application.id, resource_owner_id: current_user.id)
      .order(created_at: :desc)
      .limit(REUSABLE_TOKEN_LOOKUP_LIMIT)
      .find { |candidate| candidate.scopes.to_s.split.sort == wanted }
  end

  def create_refresh_token!(application, scopes)
    Doorkeeper::AccessToken.create!(
      application: application,
      resource_owner_id: current_user.id,
      scopes: scopes,
      expires_in: 10.years.to_i,
      multi_account: true,
      purpose: 'multi_account_refresh',
      long_lived: true
    )
  end
end
