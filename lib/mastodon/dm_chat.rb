# frozen_string_literal: true

# @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
#   인스턴스별 on/off 스위치.
#
#   코드 기본값은 꺼짐이다. 이 코드는 main 에 병합되어 기존 운영 서버도 업데이트하며
#   받게 되는데, 아무도 요청하지 않은 화면이 어느 날 생기면 안 된다.
#
#   새로 설치하는 서버가 켜진 채로 시작하도록 .env.production.sample 에
#   `DM_CHAT_ENABLED=true` 를 넣는 것은 **아직 하지 않았다**. 설정 파일을 건드리지
#   않기로 한 제약 때문이며, 그때까지는 운영자가 직접 넣어야 한다.
#   설명은 docs/dm-chat/ops/dm-chat-development.md §1.
#   근거: dm-chat-decisions.md D-09, dm-chat-plan.md §4.1
#
#   꺼졌을 때의 동작은 다음과 같이 고정한다.
#     사이드바 진입점        감춤
#     /messages 라우트       /conversations 로 리다이렉트
#     /api/v1/dm_rooms*      404 (403 이 아니다 — 기능의 존재 자체를 노출하지 않는다)
module Mastodon
  module DmChat
    module_function

    # 상수로 굳히지 않고 호출할 때마다 ENV 를 읽는다. 이 파일은 config/application.rb
    # 에서 `class Application < Rails::Application` **위쪽**에 require 되는데, dotenv 가
    # .env.production 을 읽는 시점(before_configuration)이 바로 그 클래스 정의 순간이다.
    # 상수로 만들면 .env 가 반영되기 전에 값이 확정돼 무조건 false 로 굳는다.
    # 실제로 그렇게 되어 운영에서 플래그를 켜도 /messages 가 /conversations 로
    # 리다이렉트됐다. ENV 조회 비용은 무시할 수 있고, 그 대신 켜고 끄는 데
    # 재시작만 있으면 된다.
    def enabled?
      ENV['DM_CHAT_ENABLED'] == 'true'
    end
  end
end
