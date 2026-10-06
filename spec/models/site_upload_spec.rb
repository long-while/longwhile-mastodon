# frozen_string_literal: true

require 'rails_helper'

RSpec.describe SiteUpload do
  describe '#cache_key' do
    let(:site_upload) { described_class.new(var: 'var') }

    it 'returns cache_key' do
      expect(site_upload.cache_key).to eq 'site_uploads/var'
    end
  end

  describe 'wordmark validation' do
    subject { described_class.new(var: var, file: attachment_fixture(fixture)) }

    let(:var) { 'wordmark_dark' }

    context 'with a 340×160 PNG' do
      let(:fixture) { 'wordmark.png' }

      it { is_expected.to be_valid }
    end

    context 'with a PNG within 3px of 340×160' do
      let(:fixture) { 'wordmark-337x157.png' }

      it { is_expected.to be_valid }
    end

    context 'with a PNG just past the tolerance' do
      let(:fixture) { 'wordmark-344x160.png' }

      it { is_expected.to_not be_valid }
    end

    context 'with a PNG of another size' do
      let(:fixture) { '600x400.png' }

      it 'rejects it and names both sizes' do
        expect(subject).to_not be_valid
        expect(subject.errors[:file]).to include(match(/340×160.*600×400/))
      end
    end

    context 'with a GIF' do
      let(:fixture) { 'attachment.gif' }

      it 'rejects it' do
        expect(subject).to_not be_valid
        expect(subject.errors.details[:file]).to include(error: :wordmark_content_type)
      end
    end

    context 'when the upload is not a wordmark' do
      let(:var) { 'mascot' }
      let(:fixture) { '600x400.png' }

      it { is_expected.to be_valid }
    end
  end
end
