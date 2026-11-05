# frozen_string_literal: true

module Admin::DmRoomViewLog
  ACTION = :view
  WINDOW = 10.minutes

  def self.recorded_recently?(account, room)
    Admin::ActionLog.exists?(account: account, action: ACTION, target: room, created_at: WINDOW.ago..)
  end
end
