# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Admin Settings About' do
  describe 'PUT /admin/settings/about' do
    before { sign_in Fabricate(:admin_user) }

    it 'gracefully handles invalid nested params' do
      put admin_settings_about_path(form_admin_settings: 'invalid')

      expect(response)
        .to have_http_status(400)
    end

    it 'saves the character limit and serves it from the instance API right away' do
      get '/api/v2/instance'
      expect(response.parsed_body.dig(:configuration, :statuses, :max_characters)).to eq 1000

      put admin_settings_about_path, params: { form_admin_settings: { status_length_limit: '1500' } }

      expect(response).to redirect_to(admin_settings_about_path)
      expect(Setting.status_length_limit).to eq 1500

      get '/api/v2/instance'
      expect(response.parsed_body.dig(:configuration, :statuses, :max_characters)).to eq 1500
    end

    it 'refuses a limit out of range' do
      put admin_settings_about_path, params: { form_admin_settings: { status_length_limit: '20' } }

      expect(response).to have_http_status(200)
      expect(Setting.status_length_limit).to eq 1000
    end
  end
end
