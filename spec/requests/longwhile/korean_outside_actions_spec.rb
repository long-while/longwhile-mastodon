# frozen_string_literal: true

require 'rails_helper'

# @_longwhile — 화면을 한국어로 고정하는 것은 Localized 의 around_action(I18n.with_locale)이다.
# 그 바깥에서 만들어지는 문장은 기본 로캘(DEFAULT_LOCALE 이 없으면 :en)로 나온다.
#
#   - rescue_from 으로 그리는 404·403 화면: 예외가 around_action 을 빠져나온 뒤에 그린다
#     (ErrorResponses#respond_with_error).
#   - Devise 가 prepend_before_action 으로 건 require_no_authentication 의 플래시:
#     around_action 보다 앞에 돈다(가입·비밀번호 재설정 컨트롤러의 prepend_around_action).
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
