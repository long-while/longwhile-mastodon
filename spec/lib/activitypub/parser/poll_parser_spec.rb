# frozen_string_literal: true

require 'rails_helper'

RSpec.describe ActivityPub::Parser::PollParser do
  subject { described_class.new(json) }

  let(:option_count) { 3 }
  let(:options) { Array.new(option_count) { |i| { 'type' => 'Note', 'name' => "option #{i}" } } }
  let(:json) do
    {
      'type' => 'Question',
      'oneOf' => options,
    }
  end

  describe '#valid?' do
    it 'is valid for a well-formed question' do
      expect(subject.valid?).to be_truthy
    end

    it 'is invalid when there are no items' do
      expect(described_class.new('type' => 'Question').valid?).to be_falsey
    end
  end

  describe '#options' do
    it 'extracts the option names' do
      expect(subject.options).to eq ['option 0', 'option 1', 'option 2']
    end

    # GHSA-gg8q-rcg7-p79g: a single remote post must not be able to carry an unbounded
    # number of poll options.
    context 'with more options than the allowed maximum' do
      let(:option_count) { described_class::MAX_ITEMS + 50 }

      it 'caps the number of processed options at MAX_ITEMS' do
        expect(subject.options.size).to eq described_class::MAX_ITEMS
      end
    end
  end
end
