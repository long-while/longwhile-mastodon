# frozen_string_literal: true

# 이 포크는 config.time_zone = 'Asia/Seoul' 이다. 업스트림 스펙 중 날짜 경계를 UTC 로
# 전제한 것 — 예를 들어 관리자 지표는 DB 에서 UTC 시각을 날짜로 자르는데, 스펙은 기대값을
# `2.days.ago.midnight` 처럼 Time.zone 으로 만든다 — 은 서울 시각이 UTC 와 날짜가 다른
# 시간대(UTC 15시~24시)에 어긋난다. 그런 스펙에 `:utc_time_zone` 을 달아 UTC 로 돌린다.
RSpec.configure do |config|
  config.around(:each, :utc_time_zone) do |example|
    Time.use_zone('UTC') { example.run }
  end
end
