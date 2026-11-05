# frozen_string_literal: true

class MultiAccounts::SessionsController < ApplicationController
  # 팝업의 `prompt=login` 이 세션을 갈아엎은 뒤라 메인 탭의 CSRF 토큰은 이미 무효다.
  # 그래서 토큰 검사를 건너뛰는 대신 **같은 사이트에서 온 요청만** 받는다. 안 그러면
  # 다른 사이트의 폼이 공격자 자신의 state·nonce 로 피해자를 공격자 계정에 로그인시킨다.
  skip_before_action :verify_authenticity_token
  before_action :require_same_origin!

  def restore
    payload = params.require(:payload).permit(:state, :nonce)

    # consume! validates the nonce in constant time and deletes the state from Redis,
    # so a captured (state, nonce) pair cannot be replayed to re-issue a session.
    data = MultiAccounts::StateStore.consume!(payload[:state], payload[:nonce])

    user = User.find_by(id: data[:user_id])

    unless user
      render json: { error: 'User not found for state' }, status: :not_found
      return
    end

    # 정지·비활성 계정은 세션 복원을 통해서도 로그인할 수 없어야 한다. `suspended?` 가 아니라
    # `unavailable?` 다 — 4.7 의 자기 삭제(`mark_deleted!`)는 정지가 아니다. 추모 계정은
    # sign_in 이 warden 으로 던져 로그인 화면 302 가 되므로 그 전에 같은 403 으로 답한다.
    if user.disabled? || user.account&.unavailable? || !user.active_for_authentication?
      render json: { error: 'Account is suspended or disabled' }, status: :forbidden
      return
    end

    sign_in(:user, user)

    head :ok
  rescue MultiAccounts::StateStore::InvalidStateError
    render json: { error: 'Invalid state or nonce' }, status: :unauthorized
  rescue ActionController::ParameterMissing => e
    render json: { error: "Missing parameter: #{e.param}" }, status: :bad_request
  rescue StandardError => e
    Rails.logger.error("Failed to restore multi-account session: #{e.message}")
    render json: { error: 'Failed to restore session' }, status: :internal_server_error
  end

  private

  def require_same_origin!
    cross_site = request.headers['Sec-Fetch-Site'].present? && request.headers['Sec-Fetch-Site'] != 'same-origin'
    foreign_origin = request.origin.present? && request.origin != request.base_url
    return unless cross_site || foreign_origin

    render json: { error: 'Cross-origin request refused' }, status: 403
  end
end

