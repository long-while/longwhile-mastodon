# frozen_string_literal: true

# @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
#   방의 멤버 관리 — 초대 · 내보내기 · 별명.
#   근거: 2026-08-12 결정, 마이그레이션 20260812100000·20260812100100
#
#   **방을 유지하고 참여자 조합만 바꾼다.** 방 id 도 URL 도 이력도 그대로다.
#   자세한 것은 `DmRoom#add_members!` 머리말에 있다.
#
#   권한이 셋으로 갈린다.
#
#     초대   멤버 누구나
#     내보내기 **방장만**. 누구나 할 수 있으면 말다툼이 곧 강퇴가 된다
#     별명   누구나. 지정한 본인에게만 보이는 값이다
class Api::V1::DmRooms::MembersController < Api::BaseController
  include Api::DmRoomAccess

  # 참여자 조합이 겹치는 방으로는 바꿀 수 없다. 500 이 아니라 사람이 읽을 수
  # 있는 422 로 내린다 — 사용자가 할 수 있는 일(그 방을 열기)이 있는 상황이다.
  rescue_from DmRoom::DuplicateRoomError do
    render json: { error: I18n.t('dm_rooms.errors.room_exists') }, status: 422
  end

  before_action -> { doorkeeper_authorize! :write, :'write:conversations' }
  before_action :require_user!
  before_action :set_room
  before_action :set_target, only: [:destroy, :nickname]

  def create
    account_ids = requested_account_ids

    raise Mastodon::ValidationError, I18n.t('dm_rooms.errors.no_recipients') if account_ids.empty?

    # 없는 계정을 넣으면 열 수 없는 멤버십 행이 남는다. 방 생성과 같은 검사다.
    raise Mastodon::ValidationError, I18n.t('dm_rooms.errors.unknown_recipients') if Account.where(id: account_ids).count != account_ids.size

    @room.add_members!(current_account, account_ids)

    render_room
  end

  # 내보내기. **자기 자신은 이 경로로 뺄 수 없다** — 그것은 "대화 나가기"
  # (DELETE /api/v1/dm_rooms/:id)이고, 그쪽은 방을 목록에서만 감춰 새 메시지가
  # 오면 되돌아온다. 여기서 빼면 참여자 조합 자체가 바뀌어 되돌아올 수 없다.
  def destroy
    raise Mastodon::NotPermittedError if @target.id == current_account.id
    raise Mastodon::NotPermittedError unless @room.created_by?(current_account)

    @room.remove_member!(current_account, @target)

    render_room
  end

  # 별명. 빈 값이면 지운다.
  def nickname
    value = params[:nickname].to_s.strip

    raise Mastodon::ValidationError, I18n.t('dm_rooms.errors.nickname_too_long', max: DmRoomNickname::MAX_LENGTH) if value.length > DmRoomNickname::MAX_LENGTH

    # 이 방에 없는 사람에게는 붙일 수 없다. 막지 않으면 아무 계정 id 로나 행을
    # 만들 수 있고, 그 행은 어디에도 안 보이면서 쌓이기만 한다.
    raise ActiveRecord::RecordNotFound unless @room.dm_room_members.exists?(account_id: @target.id)

    @room.set_nickname!(current_account, @target, value)

    render_room
  end

  private

  def set_room
    set_dm_room_membership!(params[:dm_room_id])
  end

  def set_target
    @target = Account.find(params[:id])
  end

  def requested_account_ids
    ids = params[:account_ids]

    # account_ids[foo]=1 처럼 해시로 오면 map(&:to_i) 가 터져 500 이 된다.
    raise Mastodon::ValidationError, I18n.t('dm_rooms.errors.no_recipients') unless ids.nil? || ids.is_a?(Array) || ids.is_a?(String)

    Array(ids).map(&:to_i).uniq - [current_account.id, 0]
  end

  # 응답은 언제나 **갱신된 방**이다. 클라이언트가 멤버 목록·별명·방장을 한 번에
  # 다시 받아야 화면이 어긋나지 않는다.
  def render_room
    room = @room.reload

    render json: room,
           serializer: REST::DmRoomSerializer,
           current_account: current_account,
           hidden_status_ids: hidden_last_status_ids(room)
  end

  def hidden_last_status_ids(room)
    return [] if room.last_status_id.blank?

    DmHiddenStatus.where(account_id: current_account.id, status_id: room.last_status_id).pluck(:status_id)
  end
end
