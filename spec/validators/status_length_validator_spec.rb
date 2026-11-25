# frozen_string_literal: true

require 'rails_helper'

RSpec.describe StatusLengthValidator do
  subject { Fabricate.build :status }

  let(:limit) { 100 }
  let(:over_limit_text) { 'a' * limit * 2 }

  before { allow(described_class).to receive(:max_chars).and_return(limit) }

  context 'when status is remote' do
    before { subject.update! account: Fabricate(:account, domain: 'host.example') }

    it { is_expected.to allow_value(over_limit_text).for(:text) }
    it { is_expected.to allow_value(over_limit_text).for(:spoiler_text).against(:text) }
  end

  context 'when status is a local reblog' do
    before { subject.update! reblog: Fabricate(:status) }

    it { is_expected.to allow_value(over_limit_text).for(:text) }
    it { is_expected.to allow_value(over_limit_text).for(:spoiler_text).against(:text) }
  end

  context 'when text is over character limit' do
    it { is_expected.to_not allow_value(over_limit_text).for(:text).with_message(too_long_message) }
  end

  context 'when content warning text is over character limit' do
    it { is_expected.to_not allow_value(over_limit_text).for(:spoiler_text).against(:text).with_message(too_long_message) }
  end

  context 'when text and content warning combine to exceed limit' do
    before { subject.text = 'a' * 50 }

    it { is_expected.to_not allow_value('a' * 55).for(:spoiler_text).against(:text).with_message(too_long_message) }
  end

  context 'when text has space separated linkable URLs' do
    let(:text) { [starting_string, example_link].join(' ') }

    it { is_expected.to allow_value(text).for(:text) }
  end

  context 'when text has non-separated URLs' do
    let(:text) { [starting_string, example_link].join }

    it { is_expected.to_not allow_value(text).for(:text).with_message(too_long_message) }
  end

  context 'with excessively long URLs' do
    let(:text) { "http://example.com/valid?#{'#foo?' * 1000}" }

    it { is_expected.to_not allow_value(text).for(:text).with_message(too_long_message) }
  end

  context 'when remote account usernames cause limit excess' do
    let(:text) { ('a' * 75) + " @alice@#{'b' * 30}.com" }

    it { is_expected.to allow_value(text).for(:text) }
  end

  context 'when remote usernames are attached to long domains' do
    let(:text) { "@alice@#{'b' * Extractor::MAX_DOMAIN_LENGTH * 2}.com" }

    it { is_expected.to_not allow_value(text).for(:text).with_message(too_long_message) }
  end

  context 'with special character strings' do
    let(:multibyte_emoji) { '✨' * limit }
    let(:zwj_sequence) { '🏳️‍⚧️' * limit }

    it { is_expected.to allow_values(multibyte_emoji, zwj_sequence).for(:text) }
  end

  context 'when an existing post is saved without touching its text' do
    it 'does not measure it again, so a lower limit does not break unrelated saves' do
      status = Fabricate(:status, text: 'a' * 50)
      allow(described_class).to receive(:max_chars).and_return(10)

      status.sensitive = true

      expect(status).to be_valid
    end
  end

  context 'when an existing post that is now over the limit is edited' do
    let(:status) { Status.find(Fabricate(:status, text: 'a' * 150, length_limit_override: 200).id) }

    before { status }

    it 'allows it up to its original length' do
      status.text = 'b' * 150

      expect(status).to be_valid
    end

    it 'does not let it grow' do
      status.text = 'b' * 151

      expect(status).to_not be_valid
      expect(status.errors[:text]).to include(I18n.t('statuses.over_character_limit', max: 150))
    end
  end

  context 'when a scheduled post carries the limit it was scheduled under' do
    it 'allows it even if the limit went down since' do
      status = Fabricate.build(:status, text: 'a' * 150, length_limit_override: 200)

      expect(status).to be_valid
    end
  end

  describe '.max_chars' do
    before { allow(described_class).to receive(:max_chars).and_call_original }

    it 'reads the admin setting' do
      Setting.status_length_limit = 1500

      expect(described_class.max_chars).to eq 1500
    end

    it 'falls back to the default for blank, invalid or out-of-range values' do
      ['', 'abc', 100, 20_000, nil].each do |value|
        Setting.status_length_limit = value

        expect(described_class.max_chars).to eq described_class::DEFAULT_MAX_CHARS
      end
    end
  end

  private

  def too_long_message
    I18n.t('statuses.over_character_limit', max: limit)
  end

  def starting_string
    'a' * 76
  end

  def example_link
    "http://#{'b' * 30}.com/example"
  end
end
