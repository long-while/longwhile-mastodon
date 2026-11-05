# frozen_string_literal: true

# @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 운영 관리
#   운영진이 보는 방 정보. REST::DmRoomSerializer 와 필드 이름은 같게 두되,
#   **뜻이 다른 것 셋을 바꾼다.**
#
#     accounts             참여자 **전원**. 일반 시리얼라이저는 보는 사람을 뺀
#                          목록(other_accounts)을 주는데, 운영진은 참여자가
#                          아니므로 그 계산이 성립하지 않는다. 그대로 쓰면
#                          "누구와 누구의 대화인지" 를 알 수 없다.
#     unread_count         항상 0. 운영진의 읽음 상태라는 것이 없다.
#     last_read_status_id  항상 null. 같은 이유.
#
#   클라이언트가 같은 타입(ApiDmRoomJSON)으로 읽을 수 있게 필드는 유지한다.
class REST::Admin::DmRoomSerializer < ActiveModel::Serializer
  attributes :id, :unread_count, :root_status_id, :last_read_status_id,
             :is_group, :is_local, :title

  has_many :members, key: :accounts, serializer: REST::AccountSerializer
  has_one :last_status, serializer: REST::StatusSerializer

  def id
    object.id.to_s
  end

  def root_status_id
    object.root_status_id&.to_s
  end

  # 운영진은 이 방을 읽은 적이 없다. 값을 지어내지 않는다.
  def unread_count
    0
  end

  def last_read_status_id
    nil
  end

  def is_group # rubocop:disable Naming/PredicatePrefix
    object.group?
  end

  def is_local # rubocop:disable Naming/PredicatePrefix
    object.members.all?(&:local?)
  end
end
