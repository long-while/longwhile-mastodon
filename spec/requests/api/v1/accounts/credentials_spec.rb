# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'credentials API' do
  include_context 'with API authentication', user_fabricator: :private_user, oauth_scopes: 'read:accounts write:accounts'

  describe 'GET /api/v1/accounts/verify_credentials' do
    subject do
      get '/api/v1/accounts/verify_credentials', headers: headers
    end

    it_behaves_like 'forbidden for wrong scope', 'write write:accounts'

    it 'returns http success with expected content' do
      subject

      expect(response)
        .to have_http_status(200)
      expect(response.content_type)
        .to start_with('application/json')
      expect(response.parsed_body).to include({
        source: hash_including({
          discoverable: false,
          indexable: false,
        }),
        locked: true,
      })
    end

    describe 'allows the profile scope' do
      let(:scopes) { 'profile' }

      it 'returns the response successfully' do
        subject

        expect(response).to have_http_status(200)
        expect(response.content_type)
          .to start_with('application/json')

        expect(response.parsed_body).to include({
          locked: true,
        })
      end
    end
  end

  describe 'PATCH /api/v1/accounts/update_credentials' do
    subject do
      patch '/api/v1/accounts/update_credentials', headers: headers, params: params
    end

    let(:params) do
      {
        avatar: fixture_file_upload('avatar.gif', 'image/gif'),
        discoverable: true,
        display_name: "Alice Isn't Dead",
        header: fixture_file_upload('attachment.jpg', 'image/jpeg'),
        indexable: true,
        locked: false,
        note: 'Hello!',
        attribution_domains: ['example.com'],
        source: {
          privacy: 'unlisted',
          sensitive: true,
        },
      }
    end

    it_behaves_like 'forbidden for wrong scope', 'read read:accounts'

    describe 'with empty source list' do
      let(:params) { { display_name: "I'm a cat", source: {} } }

      it 'returns http success' do
        subject
        expect(response).to have_http_status(200)
        expect(response.content_type)
          .to start_with('application/json')
      end
    end

    describe 'with invalid data' do
      let(:params) { { note: 'a' * 2 * Account::NOTE_LENGTH_LIMIT } }

      it 'returns http unprocessable entity' do
        subject
        expect(response).to have_http_status(422)
        expect(response.content_type)
          .to start_with('application/json')
        expect(response.parsed_body)
          .to include( # 응답 문구는 한국어 고정(Localized)
            error: /\A#{Regexp.escape(I18n.t('activerecord.errors.messages.record_invalid', errors: '', locale: :ko).strip)}/,
            details: include(note: contain_exactly(include(error: 'ERR_TOO_LONG', description: I18n.t('errors.messages.too_long', attribute: Account.human_attribute_name(:note, locale: :ko), count: Account::NOTE_LENGTH_LIMIT, locale: :ko))))
          )
      end
    end

    it 'returns http success with updated JSON attributes' do
      subject

      expect(response)
        .to have_http_status(200)
      expect(response.content_type)
        .to start_with('application/json')
      expect(response.parsed_body)
        .to include({
          source: hash_including({
            discoverable: true,
            indexable: true,
          }),
          locked: false,
        })
      expect(user.account.reload)
        .to have_attributes(
          display_name: eq("Alice Isn't Dead"),
          note: 'Hello!',
          avatar: exist,
          header: exist,
          attribution_domains: ['example.com']
        )
      # 값은 저장되지만, 이 포크는 기본 공개 범위를 언제나 private 로 돌려준다(User::HasSettings#setting_default_privacy).
      expect(user.reload)
        .to have_attributes(
          settings: have_attributes(default_privacy: 'unlisted'),
          setting_default_privacy: eq('private'),
          setting_default_sensitive: be(true)
        )
      expect(ActivityPub::UpdateDistributionWorker)
        .to have_enqueued_sidekiq_job(user.account_id)
    end
  end
end
