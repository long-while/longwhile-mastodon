# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Multi-account session restore' do
  let(:user) { Fabricate(:user) }
  let(:state) { SecureRandom.uuid }
  let(:nonce) { SecureRandom.uuid }
  let(:same_origin) { "https://#{Rails.configuration.x.local_domain}" }

  before do
    MultiAccounts::StateStore.store!(state: state, nonce: nonce, user_id: user.id, redirect_uri: 'https://example.com/callback')
  end

  describe 'POST /multi_accounts/session/restore' do
    subject { post '/multi_accounts/session/restore', params: { payload: { state: state, nonce: nonce } }, headers: headers }

    context 'when the request comes from this site' do
      let(:headers) { { 'Origin' => same_origin } }

      it 'signs the user in and consumes the state' do
        subject

        expect(response).to have_http_status(200)
        expect(session['warden.user.user.key']).to be_present
        expect(MultiAccounts::StateStore.fetch(state)).to be_nil
      end
    end

    # CSRF 검사를 건너뛰는 엔드포인트다. 다른 사이트의 폼이 공격자 자신의 state·nonce 로
    # 이곳을 부르면, 피해자의 브라우저가 공격자 계정으로 로그인된다(login CSRF).
    context 'when the request comes from another site' do
      let(:headers) { { 'Origin' => 'https://attacker.example' } }

      it 'refuses without signing anyone in or consuming the state' do
        subject

        expect(response).to have_http_status(403)
        expect(session['warden.user.user.key']).to be_nil
        expect(MultiAccounts::StateStore.fetch(state)).to be_present
      end
    end

    # 4.7 부터 자기 삭제는 정지가 아니라 `requested_deletion_at` 만 채운다(`mark_deleted!`).
    # 삭제 작업이 돌기 전까지 그 계정의 사용자 행이 남아 있다.
    context 'when the account has requested its own deletion' do
      let(:headers) { { 'Origin' => same_origin } }

      before { user.account.mark_deleted! }

      it 'refuses without signing anyone in' do
        subject

        expect(response).to have_http_status(403)
        expect(session['warden.user.user.key']).to be_nil
      end
    end

    context 'when the browser marks the request as cross-site' do
      let(:headers) { { 'Sec-Fetch-Site' => 'cross-site' } }

      it 'refuses without signing anyone in' do
        subject

        expect(response).to have_http_status(403)
        expect(session['warden.user.user.key']).to be_nil
      end
    end
  end
end
