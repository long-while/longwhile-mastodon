# frozen_string_literal: true

require 'rails_helper'

RSpec.describe OAuth::AuthorizationsController do
  render_views

  let(:app) { Doorkeeper::Application.create!(name: 'test', redirect_uri: 'http://localhost/', scopes: 'read') }

  describe 'GET #new' do
    subject do
      get :new, params: { client_id: app.uid, response_type: 'code', redirect_uri: 'http://localhost/', scope: 'read' }
    end

    context 'when signed in' do
      let!(:user) { Fabricate(:user) }

      before do
        sign_in user, scope: :user
      end

      it 'returns http success and private cache control headers' do
        subject

        expect(response)
          .to have_http_status(200)
        expect(response.headers['Cache-Control'])
          .to include('private, no-store')
        expect(response.parsed_body.at('body.modal-layout'))
          .to be_present
        expect(controller.stored_location_for(:user))
          .to eq authorize_path_for(app)
      end

      context 'when app is already authorized' do
        before do
          Doorkeeper::AccessToken.find_or_create_for(
            application: app,
            resource_owner: user.id,
            scopes: app.scopes,
            expires_in: Doorkeeper.configuration.access_token_expires_in,
            use_refresh_token: Doorkeeper.configuration.refresh_token_enabled?
          )
        end

        it 'redirects to callback' do
          subject
          expect(response).to redirect_to(/\A#{app.redirect_uri}/)
        end

        context 'with `force_login` param true' do
          subject do
            get :new, params: { client_id: app.uid, response_type: 'code', redirect_uri: 'http://localhost/', scope: 'read', force_login: 'true' }
          end

          it { is_expected.to have_http_status(:success) }
        end
      end
    end

    context 'when not signed in' do
      it 'redirects' do
        subject

        expect(response)
          .to redirect_to '/auth/sign_in'
        expect(controller.stored_location_for(:user))
          .to eq authorize_path_for(app)
      end
    end

    def authorize_path_for(app)
      "/oauth/authorize?client_id=#{app.uid}&redirect_uri=http%3A%2F%2Flocalhost%2F&response_type=code&scope=read"
    end
  end

  # @_longwhile — 동의 폼의 POST(그리고 거부의 DELETE)에는 쿼리스트링이 없다.
  #   여기서도 돌아갈 곳을 적어 두던 시절에는 `user_return_to` 가 **파라미터
  #   없는 `/oauth/authorize`** 가 됐고, 그 뒤 아무 때나 로그인하면 Devise 가
  #   거기로 보내 Doorkeeper 가 "필수 매개변수 누락: client_id." 를 띄웠다.
  describe 'the stored return location' do
    let!(:user) { Fabricate(:user) }

    let(:authorize_params) do
      { client_id: app.uid, response_type: 'code', redirect_uri: 'http://localhost/', scope: 'read' }
    end

    before { sign_in user, scope: :user }

    it 'is not written by the consent form POST' do
      post :create, params: authorize_params

      expect(controller.stored_location_for(:user)).to be_nil
    end

    it 'is not written by the deny DELETE' do
      delete :destroy, params: authorize_params

      expect(controller.stored_location_for(:user)).to be_nil
    end

    it 'is still written by the authorize GET' do
      get :new, params: authorize_params

      expect(controller.stored_location_for(:user)).to_not be_nil
    end
  end
end
