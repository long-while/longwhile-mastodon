# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Admin::Settings::UploadsHelper do
  describe '#site_upload_preview_url' do
    it 'returns nothing for an upload that was never saved' do
      expect(helper.site_upload_preview_url(SiteUpload.new(var: 'favicon'))).to be_nil
    end

    it 'returns the stored image' do
      upload = Fabricate(:site_upload, var: 'mascot')

      expect(helper.site_upload_preview_url(upload)).to eq upload.file.url
    end

    it 'returns nothing while an unsaved replacement is attached' do
      upload = Fabricate(:site_upload, var: 'mascot')
      upload.file = attachment_fixture('600x400.png')

      expect(helper.site_upload_preview_url(upload)).to be_nil
    end
  end

  describe '#half_set_wordmark' do
    let(:settings) { Form::AdminSettings.new }

    it 'is nil when neither wordmark is uploaded' do
      expect(helper.half_set_wordmark(settings)).to be_nil
    end

    it 'names the one still using the default' do
      Fabricate(:site_upload, var: 'wordmark_dark', file: attachment_fixture('wordmark.png'))

      expect(helper.half_set_wordmark(settings)).to eq 'wordmark_light'
    end

    it 'is nil when both are uploaded' do
      Fabricate(:site_upload, var: 'wordmark_dark', file: attachment_fixture('wordmark.png'))
      Fabricate(:site_upload, var: 'wordmark_light', file: attachment_fixture('wordmark.png'))

      expect(helper.half_set_wordmark(settings)).to be_nil
    end
  end

  describe '#wordmark_input_data' do
    it 'hands the browser the same limits the model enforces' do
      expect(helper.wordmark_input_data)
        .to include(expected_width: 340, expected_height: 160, tolerance: 3, allowed_types: 'image/png,image/jpeg')
        .and include(size_error: include('{actual}'))
    end
  end

  describe '#site_upload_default_asset' do
    it 'points at the bundled image currently in use' do
      expect(helper.site_upload_default_asset(:favicon)).to eq 'icons/favicon-48x48.png'
      expect(helper.site_upload_default_asset(:wordmark_light)).to eq 'images/logos/wordmark_light.png'
    end

    it 'follows the theme-ui images when that theme is active' do
      Setting.theme = 'theme-ui-dark'

      expect(helper.site_upload_default_asset(:wordmark_dark)).to eq 'images/theme/wordmark_dark.png'
    end
  end
end
