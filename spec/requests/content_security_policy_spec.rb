# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Content-Security-Policy' do
  before { allow(SecureRandom).to receive(:base64).with(16).and_return('ZbA+JmE7+bK8F5qvADZHuQ==') }

  it 'sets the expected CSP headers' do
    get '/'

    expect(response_csp_headers)
      .to match_array(expected_csp_headers)
  end

  it 'allows inline style attributes on a normal page without opening style-src' do
    get '/'

    expect(response_csp_headers).to include("style-src-attr 'unsafe-inline'")
    style_src = response_csp_headers.find { |directive| directive.start_with?('style-src ') }
    expect(style_src).to_not include("'unsafe-inline'")
  end

  it 'does not inherit style-src-attr in the minimal API policy' do
    get '/api/v1/instance'

    expect(response_csp_headers).to_not include(a_string_starting_with('style-src-attr'))
  end

  it 'does not inherit style-src-attr in the remote interaction helper policy' do
    get remote_interaction_helper_path

    expect(response_csp_headers).to_not include(a_string_starting_with('style-src-attr'))
  end

  def response_csp_headers
    response
      .headers['Content-Security-Policy']
      .split(';')
      .map(&:strip)
  end

  def expected_csp_headers
    <<~CSP.split("\n").map(&:strip)
      base-uri 'none'
      child-src 'self' blob: #{local_domain}
      connect-src 'self' data: blob: #{local_domain} #{Rails.configuration.x.streaming_api_base_url}
      default-src 'none'
      font-src 'self' #{local_domain}
      form-action 'none'
      frame-ancestors 'none'
      frame-src 'self' https:
      img-src 'self' data: blob: #{local_domain}
      manifest-src 'self' #{local_domain}
      media-src 'self' data: #{local_domain}
      script-src 'self' #{local_domain} 'wasm-unsafe-eval'
      style-src 'self' #{local_domain} 'nonce-ZbA+JmE7+bK8F5qvADZHuQ=='
      style-src-attr 'unsafe-inline'
      worker-src 'self' blob: #{local_domain}
    CSP
  end

  def local_domain
    root_url(host: Rails.configuration.x.local_domain).chop
  end
end
