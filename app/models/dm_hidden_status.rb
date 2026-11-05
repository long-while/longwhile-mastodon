# frozen_string_literal: true

# == Schema Information
#
# Table name: dm_hidden_statuses
#
#  id         :bigint(8)        not null, primary key
#  created_at :datetime         not null
#  updated_at :datetime         not null
#  account_id :bigint(8)        not null
#  status_id  :bigint(8)        not null
#

# @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
#   "나에게서만 삭제" 한 메시지. 근거: 마이그레이션 20260812000000 주석.
#
#   되돌리는 경로는 두지 않았다. 숨긴 글을 다시 꺼내려면 그것을 보여주는 화면이
#   따로 있어야 하는데, "내 화면에서 지웠다" 는 약속과 어긋난다. 그래서 메뉴에서
#   확인 모달을 거친다 — 되돌릴 수 없다는 것을 그 자리에서 알려야 한다.
class DmHiddenStatus < ApplicationRecord
  belongs_to :account
  belongs_to :status

  # 이 계정에게 보이지 않아야 할 status id 들. 서브쿼리로 쓰라고 스코프로 둔다.
  # `pluck` 로 배열을 만들지 않는다 — 오래된 방은 숨긴 글이 수백 건일 수 있고,
  # 그것을 IN 목록으로 펴면 쿼리가 그만큼 길어진다.
  scope :status_ids_for, ->(account) { where(account_id: account.id).select(:status_id) }
end
