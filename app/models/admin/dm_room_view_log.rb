# frozen_string_literal: true

# @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 운영 관리
#   운영진이 남의 DM 방을 연 것을 /admin/action_logs 에 남긴다(action :view, 대상
#   DmRoom). 기록 자체는 마스토돈의 Admin::ActionLog 이고, 여기서는 "언제 또 적을지"
#   만 정한다.
#
#   **같은 사람이 같은 방을 연 것은 WINDOW 동안 한 번만 적는다.** 방 화면은 열 때
#   첫 페이지를, 위로 스크롤할 때마다 이전 페이지를 받고, 다른 방에 갔다 돌아오면
#   첫 페이지를 다시 받는다. 요청마다 적으면 방 하나 읽는 데 기록이 수십 줄 쌓여
#   다른 운영 기록이 묻힌다.
#
#   "첫 페이지만 적기" 는 택하지 않았다. 커서(max_id)를 붙인 요청만 보내면 기록
#   없이 방 전체를 읽을 수 있고, 반대로 화면을 다시 열 때마다 또 적힌다. 시간 창은
#   어느 페이지로 들어오든 처음 한 번은 반드시 적는다.
#
#   10분은 "한 번 앉아서 그 방을 읽은 것" 의 길이다. 그보다 지나서 다시 보면 따로
#   본 것으로 친다. 기준은 따로 저장하지 않고 이미 남은 기록에서 찾는다 —
#   admin_action_logs 의 (target_type, target_id) 인덱스를 탄다. 동시에 두 요청이
#   들어오면 두 줄이 남을 수 있지만, 덜 적히는 쪽보다 낫다.
module Admin::DmRoomViewLog
  ACTION = :view
  WINDOW = 10.minutes

  def self.recorded_recently?(account, room)
    Admin::ActionLog.exists?(account: account, action: ACTION, target: room, created_at: WINDOW.ago..)
  end
end
