# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Legacy /web redirect' do
  describe 'GET /web/*' do
    it 'redirects a normal path to the local SPA path' do
      get '/web/getting-started'

      expect(response).to have_http_status(302)
      # 요청 스펙은 rails_helper 가 host! 를 LOCAL_DOMAIN 으로 맞춘다. 같은 호스트에 머무는지를 본다.
      expect(URI.parse(response.location).host).to eq(Rails.configuration.x.local_domain)
      expect(response.location).to end_with('/getting-started')
    end

    # GHSA-xqw8-4j56-5hj6
    it 'does not turn an encoded-slash path into an off-site redirect' do
      get '/web/%2Fevil.com'

      expect(response.location).to_not start_with('//')
      expect(URI.parse(response.location).host).to_not eq('evil.com')
    end

    it 'does not turn an encoded-backslash path into an off-site redirect' do
      get '/web/%5Cevil.com'

      expect(response.location).to_not start_with('/\\')
      expect(URI.parse(response.location).host).to_not eq('evil.com')
    end
  end
end
