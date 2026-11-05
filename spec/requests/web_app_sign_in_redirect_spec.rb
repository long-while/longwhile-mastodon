# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Signed-out visits to the web app' do
  shared_examples 'sends signed-out visitors to the login form' do
    it 'redirects / and /about to the sign-in page' do
      get '/'
      expect(response).to redirect_to(new_user_session_path)

      get '/about'
      expect(response).to redirect_to(new_user_session_path)
    end

    it 'still renders the web app once signed in' do
      sign_in Fabricate(:user)

      get '/'
      expect(response).to have_http_status(200)

      get '/about'
      expect(response).to have_http_status(200)
    end
  end

  context 'when LIMITED_FEDERATION_MODE is on' do
    around do |example|
      original = Rails.configuration.x.mastodon.limited_federation_mode
      Rails.configuration.x.mastodon.limited_federation_mode = true
      example.run
    ensure
      Rails.configuration.x.mastodon.limited_federation_mode = original
    end

    it_behaves_like 'sends signed-out visitors to the login form'
  end

  context 'when DISALLOW_UNAUTHENTICATED_API_ACCESS is on' do
    around do |example|
      ClimateControl.modify(DISALLOW_UNAUTHENTICATED_API_ACCESS: 'true') { example.run }
    end

    it_behaves_like 'sends signed-out visitors to the login form'
  end

  context 'when the API is open to signed-out visitors' do
    it 'keeps rendering the public about page' do
      get '/about'

      expect(response).to have_http_status(200)
    end
  end
end
