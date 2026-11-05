# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'I18n' do
  describe 'Korean locale completeness' do
    def flatten_keys(node, prefix = [])
      return [] if node.blank?
      return [prefix.join('.')] unless node.is_a?(Hash)

      node.flat_map { |key, value| flatten_keys(value, prefix + [key.to_s]) }
    end

    def locale_keys(path, locale)
      return [] unless path.exist?

      tree = YAML.safe_load_file(path, aliases: true)[locale]
      flatten_keys(tree).map { |key| key.sub(/\.(zero|one|two|few|many|other)\z/, '') }.uniq
    end

    Rails.root.glob('config/locales/{,**/*.}en.yml').each do |en_path|
      it "has every key of #{en_path.relative_path_from(Rails.root)} in Korean" do
        ko_path = en_path.sub(/en\.yml\z/, 'ko.yml')

        expect(locale_keys(en_path, 'en') - locale_keys(ko_path, 'ko')).to be_empty
      end
    end
  end

  describe 'Korean web app messages' do
    it 'has every message id the web app uses in ko.json' do
      ko = JSON.parse(Rails.root.join('app', 'javascript', 'mastodon', 'locales', 'ko.json').read)
      used = Rails.root.glob('app/javascript/mastodon/**/*.{js,jsx,ts,tsx}')
        .reject { |path| path.to_s.include?('__tests__') }
        .flat_map { |path| path.read.scan(/\bid[:=]\s*\{?\s*['"]([a-z0-9_]+(?:\.[a-zA-Z0-9_-]+)+)['"]/).flatten }

      expect(used.uniq - ko.keys).to be_empty
    end
  end
end
