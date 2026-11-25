# frozen_string_literal: true

require 'rails_helper'

RSpec.describe TextColorPalette do
  describe '.normalize' do
    it 'reads the indexed hash a form sends, in order' do
      raw = { '1' => { 'name' => ' 빨강 ', 'hex' => '# CF 51 48' }, '0' => { 'name' => '파랑', 'hex' => '387DC9' } }

      expect(described_class.normalize(raw)).to eq [
        { 'name' => '빨강', 'hex' => 'cf5148' },
        { 'name' => '파랑', 'hex' => '387dc9' },
      ]
    end

    it 'drops rows left completely empty' do
      expect(described_class.normalize([{ 'name' => ' ', 'hex' => '' }, { 'name' => 'a', 'hex' => 'fff' }]))
        .to eq [{ 'name' => 'a', 'hex' => 'fff' }]
    end

    it 'ignores values that are not rows' do
      expect(described_class.normalize(['oops', nil])).to eq []
    end
  end

  describe '.problems' do
    def problems(colors)
      described_class.problems(colors).map(&:first)
    end

    it 'accepts the default palette' do
      expect(problems(described_class.normalize(Setting.default_settings['text_color_palette']))).to be_empty
    end

    it 'reports a missing name, a long name and an invalid code' do
      colors = [
        { 'name' => '', 'hex' => 'fff' },
        { 'name' => 'x' * (described_class::NAME_MAX_LENGTH + 1), 'hex' => 'fff' },
        { 'name' => 'ok', 'hex' => 'ffff' },
      ]

      expect(problems(colors)).to eq %i(blank_name long_name invalid_hex)
    end

    it 'allows at most twelve colors' do
      colors = Array.new(described_class::MAX_COLORS + 1) { |i| { 'name' => "c#{i}", 'hex' => 'fff' } }

      expect(problems(colors)).to eq %i(too_many)
      expect(problems(colors.first(described_class::MAX_COLORS))).to be_empty
    end
  end

  describe '.current' do
    it 'serves the nine defaults when nothing is saved' do
      expect(described_class.current.size).to eq 9
      expect(described_class.current.first).to eq('name' => '회색 텍스트', 'hex' => '7d7a75')
    end

    it 'skips malformed saved entries' do
      Setting.text_color_palette = [{ 'name' => 'ok', 'hex' => 'f00' }, { 'name' => '', 'hex' => 'fff' }, { 'name' => 'bad', 'hex' => 'zz' }]

      expect(described_class.current).to eq [{ 'name' => 'ok', 'hex' => 'f00' }]
    end
  end
end
