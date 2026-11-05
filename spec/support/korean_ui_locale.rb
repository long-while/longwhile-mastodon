# frozen_string_literal: true

# 이 포크는 화면을 언제나 한국어로 그린다(`Localized#requested_locale` 이 :ko).
# 테스트의 기본 로캘은 :en 이라, 스펙이 `I18n.t` 로 계산한 기대값만 영어가 되어
# 화면과 어긋난다. 화면을 그리는 스펙은 같은 로캘로 기대값을 계산한다.
# 화면 로캘과 달리 Faker 가 만드는 데이터는 영어로 둔다. Faker 는 로캘을 정하지 않으면
# I18n.locale 을 따르는데, :ko 단어로 만든 태그 이름 등은 검증을 통과하지 못한다.
Faker::Config.locale = :en

RSpec.configure do |config|
  %i(controller system).each do |type|
    config.around(:each, type: type) do |example|
      I18n.with_locale(:ko) { example.run }
    end
  end
end
