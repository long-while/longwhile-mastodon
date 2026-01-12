# frozen_string_literal: true

class MultiAccounts::CallbacksController < ApplicationController
  skip_before_action :verify_authenticity_token
  before_action :authenticate_user!

  content_security_policy do |p|
    # Allow inline scripts with nonce for postMessage functionality
    p.script_src :self, :unsafe_inline
  end

  after_action :set_script_nonce_directive

  def show
    @state = params.require(:state)
    @code = params.require(:code)

    # Verify state exists in Redis
    data = MultiAccounts::StateStore.fetch(@state)

    if data.blank?
      render_error('인증 세션이 만료되었거나 유효하지 않습니다. 다시 시도해주세요.')
      return
    end

    # Keep the OAuth account session (don't restore original user)
    # The client will handle switching between accounts using tokens
    # When the page reloads, it will be in the context of the newly logged-in account

    # Store code and state for the view to send via postMessage
    @redirect_uri = data[:redirect_uri]
    @redirect_origin =
      begin
        uri = Addressable::URI.parse(@redirect_uri)
        uri.port && uri.port != uri.default_port ? "#{uri.scheme}://#{uri.host}:#{uri.port}" : "#{uri.scheme}://#{uri.host}"
      rescue Addressable::URI::InvalidURIError, TypeError
        nil
      end
  rescue ActionController::ParameterMissing => e
    render_error("필수 파라미터 누락: #{e.param}")
  rescue StandardError => e
    Rails.logger.error("Multi-account OAuth callback error: #{e.message}")
    Rails.logger.error(e.backtrace.join("\n"))
    render_error('계정 추가 중 오류가 발생했습니다. 다시 시도해주세요.')
  end

  private

  def set_script_nonce_directive
    # Enable nonce for script-src to allow inline scripts
    request.content_security_policy_nonce_directives = %w(script-src)
  end

  def render_error(message)
    @error = message
    render :show, status: :bad_request
  end
end
