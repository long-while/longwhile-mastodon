# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Auth Sessions' do
  describe 'DELETE /auth/sign_out' do
    before { sign_in Fabricate(:user) }

    it 'asks the browser to clear site storage with forget_device=1' do
      delete destroy_user_session_path(forget_device: '1')

      expect(response).to redirect_to(new_user_session_path)
      expect(response.headers['Clear-Site-Data']).to eq('"storage"')
    end

    it 'does not send Clear-Site-Data without the parameter' do
      delete destroy_user_session_path

      expect(response).to redirect_to(new_user_session_path)
      expect(response.headers).to_not have_key('Clear-Site-Data')
    end

    it 'ignores other values of the parameter' do
      delete destroy_user_session_path(forget_device: '0')

      expect(response.headers).to_not have_key('Clear-Site-Data')
    end
  end

  describe 'POST /auth/sign_in' do
    # The rack-attack check has issues with the non-nested invalid param used here
    before { Rack::Attack.enabled = false }
    after { Rack::Attack.enabled = true }

    it 'gracefully handles invalid nested params' do
      post user_session_path(user: 'invalid')

      expect(response)
        .to have_http_status(400)
    end
  end
end
