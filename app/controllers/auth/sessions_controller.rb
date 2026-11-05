# frozen_string_literal: true

class Auth::SessionsController < Devise::SessionsController
  include Redisable

  MAX_2FA_ATTEMPTS_PER_HOUR = 10

  # 계정 추가 팝업이 남긴 "로그인 뒤 돌아갈 곳" 표식의 유효 기간. 팝업 흐름은
  # 보통 1~2분이면 끝나므로, 그보다 오래된 표식은 **중단된 흐름의 잔해**로 보고
  # 버린다. 팝업의 state(MultiAccounts::StateStore::TTL)와 맞춘다 — 더 짧으면
  # 보안 코드 메일을 기다리다 state 는 살아 있는데 팝업이 홈으로 떨어진다.
  MULTI_ACCOUNT_RETURN_TO_TTL = MultiAccounts::StateStore::TTL

  layout 'auth'

  skip_before_action :check_self_destruct!
  skip_before_action :require_no_authentication, only: [:create]
  skip_before_action :require_functional!
  skip_before_action :update_user_sign_in

  around_action :preserve_stored_location, only: :destroy, if: :continue_after?

  prepend_before_action :check_suspicious!, only: [:create]

  include Auth::TwoFactorAuthenticationConcern
  include Auth::SignInTokenAuthenticationConcern

  # @_longwhile — 위 두 concern 의 `prepend_before_action` 은 Localized 의
  #   around_action 보다 **먼저** 돌아서, 거기서 그리는 보안 코드 화면과 "코드가
  #   틀렸습니다" 알림이 기본 로캘(`DEFAULT_LOCALE` 이 없으면 :en)로 나왔다.
  #   Devise 의 verify_signed_out_user("이미 로그아웃됨" 플래시)도 같은 이유로 앞선다.
  #   맨 앞으로 옮긴다. 반드시 include 뒤에 둔다 — 나중에 prepend 한 것이 먼저 돈다.
  #   `only:` 를 붙이지 말 것: 같은 심볼을 다시 등록하면 Localized 의 무조건 등록이 지워져
  #   나머지 액션(로그인 폼 `new` 등)이 영어로 나온다.
  prepend_around_action :set_locale

  content_security_policy only: :new do |p|
    p.form_action(false)
  end

  def create
    super do |resource|
      # We only need to call this if this hasn't already been
      # called from one of the two-factor or sign-in token
      # authentication methods

      on_authentication_success(resource, :password) unless @on_authentication_success_called
    end
  end

  def destroy
    super
    session.delete(:challenge_passed_at)
    flash.delete(:notice)
  end

  protected

  def find_user
    if user_params[:email].present?
      find_user_from_params
    elsif session[:attempt_user_id]
      User.find_by(id: session[:attempt_user_id])
    end
  end

  def find_user_from_params
    user   = User.authenticate_with_ldap(user_params) if Devise.ldap_authentication
    user ||= User.authenticate_with_pam(user_params) if Devise.pam_authentication

    if user.present?
      @password_verified_externally = true
      return user
    end

    user = User.find_for_authentication(email: user_params[:email])
    user if user&.encrypted_password.present?
  end

  def user_params
    params.expect(user: [:email, :password, :otp_attempt, :sign_in_token_attempt, credential: {}])
  end

  def after_sign_in_path_for(resource)
    # @_longwhile — `stored_location_for` 는 **읽는 순간 세션에서 지워진다.**
    #   예전에는 `multi_account_return_to.presence || stored_location_for(:user)`
    #   라고 써서, 다중 계정 표식이 있으면 `user_return_to` 를 읽지도 지우지도
    #   않았다. 그 값이 세션에 그대로 남아 **다음 로그인을 엉뚱한 곳으로**
    #   끌고 갔다. 둘 다 무조건 꺼내 비운 뒤에 고른다.
    multi_account_return_to = consume_multi_account_return_to
    stored_url = stored_location_for(:user)

    last_url = multi_account_return_to || sanitized_return_path(stored_url)

    if home_paths(resource).include?(last_url)
      root_path
    else
      last_url || root_path
    end
  end

  def require_no_authentication
    super

    # Delete flash message that isn't entirely useful and may be confusing in
    # most cases because /web doesn't display/clear flash messages.
    flash.delete(:alert) if flash[:alert] == I18n.t('devise.failure.already_authenticated')
  end

  private

  # 계정 추가 팝업이 지금 진행 중이면, 로그인 뒤 돌아갈 곳은 그 팝업의
  # authorize URL 이 맞다. 끊긴 흐름의 잔해가 아니기만 하면 된다.
  def consume_multi_account_return_to
    url = session.delete(:multi_account_return_to)
    marked_at = session.delete(:multi_account_return_to_at)

    return if url.blank?
    # 시각이 없는 것은 이 코드 이전에 남은 표식이다. 믿지 않는다.
    return if marked_at.blank?
    return if Time.now.utc.to_i - marked_at.to_i > MULTI_ACCOUNT_RETURN_TO_TTL.to_i

    # 우리가 적은 값이지만 세션에 들어 있던 문자열이므로 모양은 확인한다.
    uri = parse_return_path(url)
    return unless uri&.path == '/oauth/authorize'
    return if uri.query_values.to_h['client_id'].blank?

    url
  end

  # @_longwhile — 로그인 뒤 돌아갈 곳으로 **쓰면 안 되는 경로**를 걸러낸다.
  #
  #   · 파라미터 없는 `/oauth/authorize` — Doorkeeper 가 "필수 매개변수 누락:
  #     client_id." 를 띄운다. 동의 폼의 POST 가 남기던 것으로,
  #     `OAuth::AuthorizationsController` 쪽에서 더는 적지 않지만 이미 세션에
  #     들어 있는 옛 값이 있을 수 있다.
  #   · `/multi_accounts/*` — 팝업 전용 화면이다. 일반 탭에서 열리면
  #     `window.close()` 가 막혀 "이 창은 자동으로 닫힙니다" 만 뜬 채 남는다.
  #   · **다중 계정 클라이언트의 `/oauth/authorize`** — 이게 핵심이다.
  #     팝업이 `prompt=login` 으로 들어오면 `store_current_location` 이 그 URL 을
  #     `user_return_to` 에 적는다. 흐름이 살아 있다면 위의 `multi_account_return_to`
  #     가 이미 이겼을 테니, 여기까지 내려왔다는 건 **중단된 흐름의 잔해**라는
  #     뜻이다. 그걸 따라가면 사용자는 메인 대신 OAuth 동의 화면으로 끌려가고,
  #     승인하면 일반 탭에서 `/multi_accounts/callback` 이 열려 영영 남는다.
  #
  #   그 밖의 `/oauth/authorize` 는 통과시킨다 — 서드파티 앱 로그인이 그 경로로
  #   정상 동작한다.
  def sanitized_return_path(path)
    uri = parse_return_path(path)
    return if uri.nil?

    return if uri.path.start_with?('/multi_accounts')

    if uri.path == '/oauth/authorize'
      client_id = uri.query_values.to_h['client_id']

      return if client_id.blank?
      return if client_id == Rails.configuration.x.multi_account[:client_id]
    end

    path
  end

  def parse_return_path(path)
    return if path.blank?

    uri = Addressable::URI.parse(path)
    return if uri.nil? || uri.path.blank?

    uri
  rescue Addressable::URI::InvalidURIError
    nil
  end

  def preserve_stored_location
    original_stored_location = stored_location_for(:user)
    yield
    store_location_for(:user, original_stored_location)
  end

  def check_suspicious!
    user = find_user
    @login_is_suspicious = suspicious_sign_in?(user) unless user.nil?
  end

  def home_paths(resource)
    paths = [about_path, '/explore']

    paths << short_account_path(username: resource.account) if single_user_mode? && resource.is_a?(User)

    paths
  end

  def continue_after?
    truthy_param?(:continue)
  end

  def restart_session
    clear_attempt_from_session
    redirect_to new_user_session_path, alert: I18n.t('devise.failure.timeout')
  end

  def register_attempt_in_session(user)
    session[:attempt_user_id]         = user.id
    session[:attempt_user_updated_at] = user.updated_at.to_s
  end

  def clear_attempt_from_session
    session.delete(:attempt_user_id)
    session.delete(:attempt_user_updated_at)
  end

  def clear_2fa_attempt_from_user(user)
    redis.del(second_factor_attempts_key(user))
  end

  def check_second_factor_rate_limits(user)
    attempts, = redis.multi do |multi|
      multi.incr(second_factor_attempts_key(user))
      multi.expire(second_factor_attempts_key(user), 1.hour)
    end

    attempts >= MAX_2FA_ATTEMPTS_PER_HOUR
  end

  def on_authentication_success(user, security_measure)
    @on_authentication_success_called = true

    clear_2fa_attempt_from_user(user)
    clear_attempt_from_session

    user.update_sign_in!(new_sign_in: true)
    sign_in(user)
    flash.delete(:notice)

    user.login_activities.create(
      request_details.merge(
        authentication_method: security_measure,
        success: true
      )
    )

    UserMailer.suspicious_sign_in(user, request.remote_ip, request.user_agent, Time.now.utc).deliver_later! if @login_is_suspicious
  end

  def suspicious_sign_in?(user)
    SuspiciousSignInDetector.new(user).suspicious?(request)
  end

  def on_authentication_failure(user, security_measure, failure_reason)
    user.login_activities.create(
      request_details.merge(
        authentication_method: security_measure,
        failure_reason: failure_reason,
        success: false
      )
    )

    # Only send a notification email every hour at most
    return if redis.set("2fa_failure_notification:#{user.id}", '1', ex: 1.hour, get: true).present?

    UserMailer.failed_2fa(user, request.remote_ip, request.user_agent, Time.now.utc).deliver_later!
  end

  def request_details
    {
      ip: request.remote_ip,
      user_agent: request.user_agent,
    }
  end

  def second_factor_attempts_key(user)
    "2fa_auth_attempts:#{user.id}:#{Time.now.utc.hour}"
  end

  def respond_to_on_destroy(**)
    respond_to do |format|
      format.json do
        render json: {
          redirect_to: after_sign_out_path_for(resource_name),
        }, status: 200
      end
      format.all { super(**) }
    end
  end
end
