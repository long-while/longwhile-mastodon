# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Media API', :attachment_processing do
  include_context 'with API authentication', oauth_scopes: 'write'

  describe 'POST /api/v2/media' do
    context 'when small media format attachment is processed immediately' do
      let(:params) { { file: fixture_file_upload('attachment-jpg.123456_abcd', 'image/jpeg') } }

      it 'returns http success' do
        post '/api/v2/media', headers: headers, params: params

        expect(File.exist?(user.account.media_attachments.first.file.path(:small)))
          .to be true

        expect(response)
          .to have_http_status(200)

        expect(response.content_type)
          .to start_with('application/json')

        expect(response.parsed_body)
          .to be_a(Hash)
      end
    end

    # @_longwhile 아이폰은 HEIC 를 그대로 올린다. libvips 가 heifload 를 막으면 500 이 난다.
    context 'when an iPhone HEIC photo is uploaded' do
      let(:params) { { file: fixture_file_upload('600x400.heic', 'image/heic') } }

      it 'converts it to JPEG and returns http success' do
        post '/api/v2/media', headers: headers, params: params

        expect(response)
          .to have_http_status(200)

        media = user.account.media_attachments.first
        expect(media)
          .to have_attributes(type: 'image', file_content_type: 'image/jpeg', file_file_name: end_with('.jpeg'))
        expect(File.exist?(media.file.path(:small)))
          .to be true
        expect(response.parsed_body)
          .to include(type: 'image', meta: include(original: include(width: 600, height: 400)))
      end
    end

    context 'when media description is too long' do
      let(:params) do
        {
          file: fixture_file_upload('attachment-jpg.123456_abcd', 'image/jpeg'),
          description: 'a' * MediaAttachment::MAX_DESCRIPTION_LENGTH * 2,
        }
      end

      it 'returns http error' do
        post '/api/v2/media', headers: headers, params: params

        expect(response).to have_http_status(422)
        # 화면 언어는 한국어로 고정돼 있다(Localized#requested_locale).
        expect(response.body).to include I18n.t('errors.messages.too_long', attribute: MediaAttachment.human_attribute_name(:description, locale: :ko), count: MediaAttachment::MAX_DESCRIPTION_LENGTH, locale: :ko)
      end
    end

    context 'when large format media attachment has not been processed' do
      let(:params) { { file: fixture_file_upload('attachment.webm', 'video/webm') } }

      it 'returns http accepted' do
        post '/api/v2/media', headers: headers, params: params

        expect(File.exist?(user.account.media_attachments.first.file.path(:small)))
          .to be true

        expect(response)
          .to have_http_status(202)

        expect(response.content_type)
          .to start_with('application/json')

        expect(response.parsed_body)
          .to be_a(Hash)
      end
    end

    describe 'when paperclip errors occur' do
      let(:media_attachments) { double }
      let(:params)            { { file: fixture_file_upload('attachment.jpg', 'image/jpeg') } }

      before do
        allow(User).to receive(:find).with(token.resource_owner_id).and_return(user)
        allow(user.account).to receive(:media_attachments).and_return(media_attachments)
      end

      context 'when file type cannot be identified' do
        before do
          allow(media_attachments).to receive(:create!).and_raise(Paperclip::Errors::NotIdentifiedByImageMagickError)
        end

        it 'returns http unprocessable entity' do
          post '/api/v2/media', headers: headers, params: params

          expect(response)
            .to have_http_status(422)

          expect(response.content_type)
            .to start_with('application/json')

          expect(response.parsed_body)
            .to be_a(Hash)
            .and include(error: /File type/)
        end
      end

      context 'when there is a generic error' do
        before do
          allow(media_attachments).to receive(:create!).and_raise(Paperclip::Error)
        end

        it 'returns http 500' do
          post '/api/v2/media', headers: headers, params: params

          expect(response)
            .to have_http_status(500)

          expect(response.content_type)
            .to start_with('application/json')

          expect(response.parsed_body)
            .to be_a(Hash)
            .and include(error: /processing/)
        end
      end
    end
  end
end
