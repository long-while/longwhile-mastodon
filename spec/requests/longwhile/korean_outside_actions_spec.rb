# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Korean text produced outside the controller action' do
  let(:user) { Fabricate(:user) }

  before { sign_in user }

  describe 'error pages raised from inside an action' do
    it 'renders an unknown address in Korean' do
      get '/settings/no-such-page'

      expect(response).to have_http_status(404)
      expect(response.body)
        .to include('lang="ko"')
        .and include(I18n.t('errors.404', locale: :ko))
    end

    it 'renders a missing record in Korean' do
      get '/filters/999999/edit'

      expect(response).to have_http_status(404)
      expect(response.body).to include(I18n.t('errors.404', locale: :ko))
    end

    it 'renders a forbidden page in Korean' do
      get '/invites'

      expect(response).to have_http_status(403)
      expect(response.body).to include(I18n.t('errors.403', locale: :ko))
    end
  end

  describe 'Devise flashes set before the action' do
    %w(/auth/sign_up /auth/password/new).each do |path|
      it "tells a signed-in user in Korean on #{path}" do
        get path

        expect(response).to have_http_status(302)
        expect(flash[:alert]).to eq I18n.t('devise.failure.already_authenticated', locale: :ko)
      end
    end

    it 'tells an already signed-out user in Korean on sign out' do
      sign_out user

      delete '/auth/sign_out'

      expect(flash[:notice]).to eq I18n.t('devise.sessions.already_signed_out', locale: :ko)
    end
  end
end
