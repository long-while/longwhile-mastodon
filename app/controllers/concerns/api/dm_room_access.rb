# frozen_string_literal: true

# @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
#   방 접근의 두 관문. 모든 dm_rooms 액션이 이것을 지난다.
#
#   1. 기능 플래그가 꺼져 있으면 404. 403 이 아닌 이유는 기능의 존재 자체를
#      노출하지 않기 위함이다. (dm-chat-plan.md §4.1)
#   2. 멤버가 아니면 404. 방 id 는 순차 증가하는 정수라 열거가 가능하므로 멤버
#      확인이 유일한 방어선이고, 403 을 주면 "그 방이 있다" 는 사실이 새어 나간다.
#      (dm-chat-phase-1.md §4.4, 기획서 §11.1)
module Api::DmRoomAccess
  extend ActiveSupport::Concern

  included do
    before_action :require_dm_chat_feature!
  end

  private

  def require_dm_chat_feature!
    raise ActiveRecord::RecordNotFound unless Mastodon::DmChat.enabled?
  end

  # 운영진 DM 열람 API 는 웹 UI 때문에 일반 read 스코프로 받는다(웹 UI 토큰에는 admin
  # 스코프가 없다). 그 대가로 운영진이 승인한 서드파티 앱이 read 토큰만으로 인스턴스의
  # 모든 DM 을 읽을 수 있었다. 웹 UI(superapp) 토큰이거나 admin:read 를 받은 토큰만
  # 통과시킨다 — 업스트림 관리 API 가 admin 스코프를 따로 요구하는 이유와 같다.
  def require_dm_admin_client!
    return if doorkeeper_token&.application&.superapp?
    return if doorkeeper_token&.acceptable?(%i(admin:read))

    raise Mastodon::NotPermittedError
  end

  def set_dm_room_membership!(room_id)
    @membership = DmRoomMember.find_by(dm_room_id: room_id, account_id: current_account.id)

    raise ActiveRecord::RecordNotFound if @membership.nil?

    @room = @membership.dm_room
  end
end
