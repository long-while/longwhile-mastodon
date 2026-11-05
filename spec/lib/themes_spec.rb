# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Themes do
  describe '#path_for' do
    it 'returns the stylesheet source of every configured theme' do
      described_class.instance.names.each do |name|
        expect(described_class.instance.path_for(name)).to match(%r{\Astyles/.+\.scss\z})
      end
    end

    it 'raises for a theme that is not configured' do
      expect { described_class.instance.path_for('no-such-theme') }.to raise_error(KeyError)
    end
  end
end
