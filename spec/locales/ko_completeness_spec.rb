# frozen_string_literal: true

require 'rails_helper'

# 한국어 고정 인스턴스인데 운영 설정의 i18n.fallbacks 가 [:en] 이라, ko 에 빠진 키는
# 오류 없이 영어로 나온다. 상류 ko.yml 은 Crowdin 이 만든 것이라 영어 원문이 바뀐 키를
# 지워 버리기도 한다(4.7 에서 사이드바의 settings.delete "계정 삭제" 가 이렇게 사라져
# "Account deletion" 으로 나왔다). 상류를 받을 때마다 여기서 걸리게 한다.
RSpec.describe 'I18n' do
  describe 'Korean locale completeness' do
    # 빈 문자열(number.human.decimal_units.units.unit 등)은 영어로 떨어져도 같다.
    def flatten_keys(node, prefix = [])
      return [] if node.blank?
      return [prefix.join('.')] unless node.is_a?(Hash)

      node.flat_map { |key, value| flatten_keys(value, prefix + [key.to_s]) }
    end

    # ko 는 복수형이 other 하나뿐이라 one 등은 키 이름에서 떼고 비교한다.
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

  # 웹 앱은 ko.json 에 없는 id 를 defaultMessage(영어)로 그린다. 고정 화면이 쓰는 id 를
  # 코드에서 모아 ko.json 과 맞춘다(DM 방의 "View profile" 이 이렇게 영어로 남아 있었다).
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
