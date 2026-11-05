# frozen_string_literal: true

class OAuth::AuthorizationsController < Doorkeeper::AuthorizationsController
  # 4.6 은 상류가 skip/before 대신 prepend 로 바꿨다. prepend 는 나중에 쓴 것이 먼저 돈다.
  # 순서는 store_current_location(new 만) → 다중 계정 강제 로그인 → 부모의
  # authenticate_resource_owner!. 강제 로그인은 인증 전에 로그아웃해야 로그인 화면으로 간다.
  prepend_before_action :handle_multi_account_force_login
  prepend_before_action :store_current_location, only: :new

  layout 'modal'

  content_security_policy do |p|
    p.form_action(false)
  end

  include Localized

  private

  # @_longwhile — **`only: :new` 가 핵심이다.** 예전에는 이 훅이 `create`(동의
  #   버튼의 POST)와 `destroy`(거부의 DELETE)에도 걸렸다. 그 두 요청에는
  #   쿼리스트링이 없으므로 `user_return_to` 에 **`/oauth/authorize` 가 파라미터
  #   없이** 적혔고, 그 뒤 아무 때나 로그인하면 Devise 가 거기로 보내
  #   Doorkeeper 가 "필수 매개변수 누락: client_id." 를 띄웠다.
  #
  #   POST/DELETE 는 어차피 `authenticate_resource_owner!` 를 이미 통과한
  #   요청이라 돌아갈 곳을 적어 둘 이유가 없다. 세션이 그 사이 끊긴 드문
  #   경우에는 동의 화면 대신 홈으로 가는데, 끊긴 링크로 보내는 것보다 낫다.
  def store_current_location
    store_location_for(:user, request.url)
  end

  def can_authorize_response?
    !truthy_param?('force_login') && super
  end

  def truthy_param?(key)
    ActiveModel::Type::Boolean.new.cast(params[key])
  end

  def multi_account_force_login_requested?
    truthy_param?('force_login') || params[:prompt] == 'login'
  end

  def multi_account_state_data
    return @multi_account_state_data if defined?(@multi_account_state_data)

    state = params[:state]
    @multi_account_state_data =
      if state.present?
        MultiAccounts::StateStore.fetch(state)
      else
        nil
      end
  rescue StandardError => e
    Rails.logger.warn("Multi-account force login state fetch failed: #{e.message}")
    @multi_account_state_data = nil
  end

  def handle_multi_account_force_login
    return unless multi_account_force_login_requested?

    state_data = multi_account_state_data
    return unless state_data.present?
    return unless state_data[:user_id].present?

    return unless user_signed_in? && current_user.id == state_data[:user_id].to_i
    return if state_data[:force_login_performed]

    MultiAccounts::StateStore.mark_force_login!(params[:state])
    @multi_account_state_data = state_data.merge(force_login_performed: true)
    sign_out(:user)
    store_location_for(:user, request.original_fullpath)

    # @_longwhile — **이 표식에는 반드시 시각을 같이 적는다.**
    #   여기서 로그아웃되는 것은 팝업만이 아니다. 팝업과 메인 탭은 세션 쿠키를
    #   공유하므로 **메인 탭도 같이 로그아웃된다.** 사용자가 팝업의 로그인
    #   화면에서 그냥 창을 닫아 버리면, 세션에는 "로그아웃 + 이 authorize 로
    #   돌아가라" 만 남는다. 그 상태로 한참 뒤에 메인 화면에서 로그인하면
    #   메인이 아니라 OAuth 동의 화면으로 끌려갔다. 시각을 함께 적어
    #   `Auth::SessionsController#after_sign_in_path_for` 가 늙은 표식을
    #   버릴 수 있게 한다.
    session[:multi_account_return_to] = request.original_fullpath
    session[:multi_account_return_to_at] = Time.now.utc.to_i
  end

  def mfa_setup_path
    super({ oauth: true })
  end
end
