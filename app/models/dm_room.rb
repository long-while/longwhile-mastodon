# frozen_string_literal: true

# == Schema Information
#
# Table name: dm_rooms
#
#  id              :bigint(8)        not null, primary key
#  member_count    :integer          default(0), not null
#  participant_key :string           not null
#  title           :string
#  created_at      :datetime         not null
#  updated_at      :datetime         not null
#  creator_id      :bigint(8)
#  last_status_id  :bigint(8)
#  root_status_id  :bigint(8)
#

# @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
#   참여자 조합 하나당 방 하나. 마스토돈의 conversation 은 스레드 단위라 같은
#   사람과의 대화가 여러 개로 쪼개지는데, 방이 그것들을 묶어 채팅 화면을 만든다.
#   근거: dm-chat-phase-1.md, ADR-001
class DmRoom < ApplicationRecord
  # 읽음 이벤트를 redis 로 직접 발행한다. 워커를 쓰지 않는 이유는 broadcast_read! 에
  # 적었다.
  include Redisable

  has_many :dm_room_members, dependent: :destroy
  has_many :dm_room_reads, dependent: :destroy
  has_many :dm_room_nicknames, dependent: :destroy
  has_many :members, through: :dm_room_members, source: :account
  has_many :conversations, dependent: nil, inverse_of: :dm_room

  belongs_to :root_status, class_name: 'Status', optional: true
  belongs_to :last_status, class_name: 'Status', optional: true

  # 방을 만든 사람. "그룹에서 삭제하기" 를 할 수 있는 유일한 사람이다.
  # 이 컬럼이 생기기 전 방에는 없을 수 있다(마이그레이션 20260812100000).
  belongs_to :creator, class_name: 'Account', optional: true

  # uniqueness 검증을 걸지 않는다. 모델 수준 검증은 SELECT 후 INSERT 라 경합에서
  # 새고, 무엇보다 create! 가 RecordInvalid 로 먼저 터져 find_or_create_for 의
  # RecordNotUnique 복구가 영영 돌지 않는다. 유일성은 DB 인덱스가 보장한다.
  validates :participant_key, presence: true

  # last_status / root_status 를 다시 고를 때 훑을 최대 행 수. 참여자 조합 비교를
  # 루비에서 하므로 무한정 읽을 수 없다.
  STATUS_SCAN_LIMIT = 200

  TITLE_MAX_LENGTH = 100

  # 제목 변경 시스템 메시지의 표식. (Phase 5, docs/dm-chat/phases/dm-chat-phase-5.md §3.2)
  #
  # **spoiler_text 에 둔다.** 시스템 메시지는 별도 테이블이 아니라 평범한 direct
  # status 다 — 시간순 위치가 저절로 잡히고, 스트리밍·방 귀속 경로를 그대로 타고,
  # 다른 클라이언트에서도 깨지지 않는다.
  #
  # 참조 구현(C7C4FF)은 REST::StatusSerializer 에서 이 표식을 감추지만 우리는 그
  # 파일을 건드리지 않는다. 회귀 문서가 공유 자산으로 지목한 파일이고, Phase 3 은
  # A 안을 포기하면서까지 지켰다(A-18). 브라우저도 DB 도 없는 상태에서 spoiler_text
  # 와 sensitive 의 반환을 조건부로 바꾸면, 잘못됐을 때 **콘텐츠 워닝이 통째로
  # 무력화되는** 형태의 사고가 난다 — Phase 2 에서 실제로 한 번 났던 종류다.
  #
  # 대신 **본문에 사람이 읽는 문장을 넣는다.** 공식 앱에서는 CW 를 펼치면 한국어
  # 문장이 그대로 읽힌다. 참조 구현 방식은 본문이 비어 있어 펼쳐도 아무것도 없다.
  # 이쪽이 하위 호환에서 오히려 낫다.
  #
  # **프론트에도 같은 문자열이 있다** (features/messages/util/title_event.ts).
  # 한쪽만 고치면 표식이 화면에 그대로 나온다.
  TITLE_EVENT_PREFIX = 'conversation:title_changed:'

  # 멤버가 바뀌었다는 안내의 표식. 제목 변경과 **같은 방식**이다 — 위 주석의
  # 이유가 그대로 적용된다(별도 테이블 없이 평범한 direct status).
  #
  # 이 안내가 단순한 알림이 아니라는 점이 중요하다. 안내를 남기는 순간 그 글이
  # **바뀐 참여자 조합 전원을 멘션**하므로, 아직 옛 명단을 들고 있는 다른 접속의
  # 화면도 그 이벤트를 받아 방을 다시 읽는다. 그 왕복이 없으면, 초대 직후 옛
  # 명단으로 보낸 메시지가 더 작은 조합의 **다른 방**으로 새어 나간다.
  #
  # **프론트에도 같은 문자열이 있다** (features/messages/util/title_event.ts).
  MEMBER_EVENT_PREFIX = 'conversation:members_changed:'

  # 안내 문장의 언어. **부른 쪽의 로케일을 따르지 않는다.**
  #
  # 이 인스턴스는 한국어 고정이다(`Localized#requested_locale` 이 늘 `:ko`). 그런데
  # 그 고정은 **요청 안에서만** 걸린다. 요청 밖(rails runner·콘솔·Sidekiq)의
  # `I18n.locale` 은 `config/initializers/i18n.rb` 가 정한 기본값인데, 그 파일은
  # `DEFAULT_LOCALE` 이 없으면 `:en` 으로 떨어진다(application.rb 의 `:ko` 를 덮는다).
  # 그래서 시드로 만든 방에 "운영자 added 앨리스." 가 영어로 저장됐다. 한번 저장된
  # 글은 그 언어로 남으므로, 만드는 순간에 못박는다.
  EVENT_LOCALE = :ko

  # 위 두 표식은 **서버가 남기는 안내문 전용**이다. 화면은 표식만 보고 말풍선 대신
  # 가운데 안내문으로 그리고, 제목 표식이면 알림도 만들지 않는다. 사용자가 붙일 수
  # 있으면 가짜 안내문("운영진이 …")을 꾸미거나 알림 없이 메시지를 보낼 수 있다.
  # 작성·수정·예약 경로가 이것으로 막고, 안내문을 남기는 쪽만 dm_room_event 로 통과한다.
  def self.reserved_event_marker?(spoiler_text)
    spoiler_text.to_s.start_with?(TITLE_EVENT_PREFIX, MEMBER_EVENT_PREFIX)
  end

  # 이 방의 참여자 상한. 컨트롤러의 MAX_PARTICIPANTS 와 같은 값이어야 한다 —
  # 새 방을 만들 때만 막고 초대는 안 막으면 상한이 없는 것과 같다.
  MAX_MEMBERS = 20

  # 참여자 조합을 바꾸려 했는데 그 조합의 방이 이미 있는 경우.
  #
  # 방의 정체성이 곧 참여자 조합이라(participant_key) 합칠 수가 없다. 두 방에
  # 각각 이력이 있고, 어느 쪽으로 모아도 다른 쪽 사람들이 못 보던 대화를 보게
  # 된다. 그래서 막고 사람에게 알린다.
  class DuplicateRoomError < StandardError
    attr_reader :room

    def initialize(room)
      @room = room
      super('a room with this participant set already exists')
    end
  end

  # 나가지 않은 멤버십이 있는 방만. (FR-27)
  scope :visible_to, lambda { |account|
    joins(:dm_room_members).merge(DmRoomMember.visible.where(account_id: account.id))
  }

  def group?
    member_count > 2
  end

  # 운영진 열람 기록(Admin::ActionLog)에 남길 이름. 그 순간의 참여자 명단이다.
  # 제목은 넣지 않는다 — 참여자가 지어 붙인 글이라 대화 내용의 일부로 본다.
  # 명단은 MAX_MEMBERS 로 묶여 있어 길이를 따로 자르지 않는다.
  def to_log_human_identifier
    members.map { |account| "@#{account.acct}" }.sort.join(', ')
  end

  # 방장인가. 만든 사람이 기록되지 않은 옛 방에서는 **아무도** 참이 아니다.
  def created_by?(account)
    creator_id.present? && creator_id == account.id
  end

  class << self
    # 목록은 last_status_id 역순이다. Paginable 은 id 기준이라 쓸 수 없어
    # AccountConversation 과 같은 형태로 직접 만든다.
    #
    # 메시지가 하나도 없는 방(last_status_id IS NULL)은 목록에서 뺀다. 정렬 기준이
    # 없어 커서 페이지네이션에 얹을 수 없고, 사용자에게 보여줄 것도 없다. 방을 막
    # 만들고 아직 아무 말도 하지 않은 상태가 여기 해당하며, 첫 메시지를 보내는
    # 순간 나타난다.
    def to_a_paginated_by_last_status_id(limit, options = {})
      if options[:min_id].present?
        paginate_rooms_by_min_id(limit, options[:min_id], options[:max_id]).reverse
      else
        paginate_rooms_by_max_id(limit, options[:max_id], options[:since_id]).to_a
      end
    end

    def paginate_rooms_by_max_id(limit, max_id = nil, since_id = nil)
      query = where.not(last_status_id: nil).order(last_status_id: :desc).limit(limit)
      query = query.where(arel_table[:last_status_id].lt(max_id)) if max_id.present?
      query = query.where(arel_table[:last_status_id].gt(since_id)) if since_id.present?
      query
    end

    def paginate_rooms_by_min_id(limit, min_id = nil, max_id = nil)
      query = where.not(last_status_id: nil).reorder(last_status_id: :asc).limit(limit)
      query = query.where(arel_table[:last_status_id].gt(min_id)) if min_id.present?
      query = query.where(arel_table[:last_status_id].lt(max_id)) if max_id.present?
      query
    end

    # 참여자 계정 id 를 본인 포함해 정렬한 뒤 해시한다.
    #
    # 본인을 빼면 그룹에서 멤버마다 키가 달라져 같은 방이 인원수만큼 쪼개지고,
    # 1대1 에서도 A 의 키와 B 의 키가 달라진다. 기존
    # account_conversations.participant_account_ids 는 수신자 본인을 제외한
    # 목록이므로, 그 값을 쓸 때는 반드시 본인을 더해 정규화해야 한다.
    # 근거: dm-chat-phase-1.md §1.3
    def participant_key_for(account_ids)
      normalized = normalize_ids(account_ids)
      raise ArgumentError, 'dm room needs at least one participant' if normalized.empty?

      Digest::SHA256.hexdigest(normalized.join(','))
    end

    def normalize_ids(account_ids)
      Array(account_ids).compact.map(&:to_i).uniq.sort
    end

    # 방을 찾거나 만든다. 동시 호출에서도 방이 하나만 생겨야 한다.
    #
    # participant_key 의 UNIQUE 제약이 최종 방어선이고, RecordNotUnique 를 잡아
    # 다시 조회한다. 잠금을 걸지 않는 이유는 방 생성이 드물고, 경합이 나더라도
    # 진 쪽이 이긴 쪽의 결과를 그대로 쓰면 되기 때문이다.
    # 근거: dm-chat-phase-1.md §2.1, 기획서 §9.4
    #
    # `creator` 는 **만들 때만** 쓴다. 이미 있는 방을 찾은 경우에는 덮지 않는다 —
    # 방장은 방이 생긴 순간에 정해지고 그 뒤로 바뀌지 않는다.
    def find_or_create_for(account_ids, creator: nil)
      ids = normalize_ids(account_ids)
      key = participant_key_for(ids)

      existing = find_by(participant_key: key)
      return existing if existing

      begin
        # requires_new: 이 메서드가 나중에 바깥 트랜잭션 안에서 불릴 수 있다. 세이브
        # 포인트가 없으면 RecordNotUnique 가 트랜잭션 전체를 무효화해, 아래 rescue 의
        # find_by! 가 "current transaction is aborted" 로 다시 터진다.
        transaction(requires_new: true) do
          room = create!(participant_key: key, member_count: ids.size, creator_id: creator&.id)
          ids.each { |account_id| room.dm_room_members.create!(account_id: account_id) }
          room
        end
      rescue ActiveRecord::RecordNotUnique
        find_by!(participant_key: key)
      end
    end

    # conversation 을 방에 붙이고, 방의 갱신을 한 번에 처리한다.
    #
    # 세 지점에서 부른다 (dm-chat-phase-1.md §3.3).
    #   1. PostStatusService#postprocess_status!  로컬 전송. 동기라 지연 창이 없다
    #   2. FanOutOnWriteService#deliver_to_conversation!  그 밖의 작성 경로
    #   3. GET /dm_rooms/:id/statuses  조회 시점 지연 귀속
    #
    # 멱등이다. 이미 붙어 있으면 귀속은 건너뛰고 갱신만 한다.
    def attach_status!(status, resurrect: true)
      return unless status.direct_visibility?
      return if status.conversation_id.blank?

      participant_ids = participants_for(status)
      return if participant_ids.size < 2
      return if history_of_another_room?(status, participant_ids)

      # 글을 써서 방이 처음 생기는 경우, 그 글을 쓴 사람이 방장이다. 이미 있는
      # 방이면 이 값은 무시된다.
      #
      # conversation 주인 방이 이 참여자를 받으면 그 방을 쓴다. 보통은 키로 찾아도 같은
      # 방이지만, 익명화된 멤버가 있으면 키(멤버 전원)와 참여자가 달라 새 방이 생긴다.
      owner = Conversation.find_by(id: status.conversation_id)&.dm_room
      room  = owner&.accepts_participants?(participant_ids) ? owner : find_or_create_for(participant_ids, creator: status.account)
      room.attach_conversation!(status.conversation_id)
      room.adopt_stray_status!(status) unless room.conversation_attached?(status.conversation_id)
      room.register_status!(status, resurrect: resurrect)
      room
    end

    # 이 글이 속한 방의 참여자 — 작성자와 (silent 가 아닌) 멘션 대상 전부.
    def participants_for(status)
      normalize_ids(status.active_mentions.pluck(:account_id) + [status.account_id])
    end

    # 이 글이 **멤버를 바꾸기 전**부터 다른 방에 있던 정상 이력인가.
    #
    # 방은 같은 행에서 참여자 조합만 바꾸므로(add_members! · remove_member!), 그 방의
    # conversation 에는 옛 명단의 글이 남는다. 팬아웃이 늦게 돌거나 재시도되어 그런
    # 글이 다시 여기로 오면, 옛 명단으로 방을 새로 만들고 글을 그리로 빼 가 버린다.
    # 마지막 멤버 변경 안내보다 앞의 글이면 손대지 않는다.
    def history_of_another_room?(status, participant_ids)
      owner = Conversation.find_by(id: status.conversation_id)&.dm_room

      return false if owner.nil? || owner.accepts_participants?(participant_ids)

      boundary = owner.last_member_event_id

      boundary.present? && status.id < boundary
    end

    # `thread` 에 답글을 달면 그 글이 `participant_ids` 의 방에 그대로 속하는가.
    # PostStatusService 가 저장 전에 묻는다. 거짓이면 새 conversation 으로 시작한다.
    #
    # 답글은 공개 범위와 무관하게 부모의 conversation_id 를 물려받는다
    # (Status#set_conversation). 그 conversation 이 **다른 방**에 붙어 있으면,
    # attach_conversation! 은 아무것도 못 하는데 register_status! 는 이 방의
    # last_status 를 그 글로 바꾼다. 그러면 목록에는 보이는데 방을 열면 비어 있고,
    # 루트까지 그쪽으로 끌려가 **그 뒤로 보내는 메시지도 전부** 다른 방으로 간다.
    # (2026-10, S/A/B 방의 메시지가 S/A/C 방에 보이던 사고)
    #
    # 그렇게 되는 경로가 여럿이다 — 일반 작성창에서 남의 스레드에 멘션을 바꿔 답하기,
    # 알림에서 옛 메시지에 답하기, 멤버가 바뀐 직후 옛 명단으로 보내기.
    def thread_accepts?(thread, participant_ids)
      thread = thread.reblog if thread.reblog?

      return true if participant_ids.size < 2 || thread.conversation_id.blank?

      room = Conversation.find_by(id: thread.conversation_id)&.dm_room

      return room.accepts_participants?(participant_ids) if room

      # 아직 방에 안 붙은 conversation. 먼저 붙는 쪽이 차지하므로, 부모가 다른
      # 조합의 DM 이면 여기서 갈라 둔다. 공개 글에 DM 으로 답하는 것은 막지 않는다.
      !thread.direct_visibility? || participants_for(thread) == participant_ids
    end
  end

  def attach_conversation!(conversation_id)
    Conversation.where(id: conversation_id, dm_room_id: nil).update_all(dm_room_id: id)
  end

  def conversation_attached?(conversation_id)
    conversation_id.present? && Conversation.exists?(id: conversation_id, dm_room_id: id)
  end

  # 다른 방의 conversation 에 들어간 채 도착한 글을 이 방으로 데려온다.
  #
  # PostStatusService 가 저장 전에 갈라 두므로 보통은 오지 않는다. 그래도 그 서비스를
  # 타지 않는 경로가 생기면 여기서 막는다 — 그냥 register_status! 하면 위
  # thread_accepts? 에 적은 상태가 그대로 만들어진다.
  #
  # PostStatusService 와 FanOutOnWriteService 가 **같은 글로 동시에** 부를 수 있다.
  # 잠그고 다시 읽은 뒤 확인한다 — 안 그러면 둘 다 옮겨 conversation 이 두 개 생긴다.
  def adopt_stray_status!(status)
    status.with_lock do
      next if conversation_attached?(status.conversation_id)

      Rails.logger.warn { "DmRoom #{id}: status #{status.id} arrived in conversation #{status.conversation_id} of another room; moving it" }

      MoveDmStatusesService.new.call([status], self)
    end
  end

  # 이 방의 마지막 멤버 변경 안내. 방은 conversation 여럿을 묶으므로 방 전체에서
  # 찾는다 — 안내는 그때의 루트 스레드에만 달리기 때문에, conversation 하나만 보면
  # 다른 conversation 의 옛 이력이 "변경 뒤" 로 보인다.
  def last_member_event_id
    Status.direct_visibility
      .where(conversation_id: conversations.select(:id))
      .where('statuses.spoiler_text LIKE ?', "#{self.class.sanitize_sql_like(MEMBER_EVENT_PREFIX)}%")
      .reorder(nil)
      .maximum(:id)
  end

  # 방의 최신 글과 루트가 이 방의 conversation 안에 살아 있는가.
  def thread_intact?
    last_status.present? && root_status.present? &&
      conversation_attached?(last_status.conversation_id) &&
      conversation_attached?(root_status.conversation_id)
  end

  # 방 하나를 열 때 부른다. 목록의 repair_orphaned_rooms! 는 last_status 가 빈 방만
  # 고치므로, 루트가 지워졌거나 다른 방의 스레드를 가리키는 방은 여기서 고친다.
  # 루트가 틀린 채로 두면 클라이언트가 그 글에 답글을 달아 같은 사고를 되풀이한다.
  def heal_thread!
    rewind_last_status! unless thread_intact?
  end

  # 방의 마지막 메시지와 루트를 갱신한다.
  #
  # 낙관적 잠금을 쓰지 않는다. 방은 행이 하나뿐이라 여러 명이 동시에 보내면 경합이
  # 그 한 행에 몰린다. 대신 "더 큰 id 일 때만 쓰는" 조건부 UPDATE 로 처리한다.
  # 순서가 뒤집혀 도착해도 안전하고 재시도가 필요 없다.
  # 근거: dm-chat-phase-1.md §1.4, 검토 S-4
  def register_status!(status, resurrect: true)
    # @_longwhile — **글을 쓴 사람은 자기 글까지 읽은 것으로 친다.**
    #
    #   원래는 방을 열 때(`POST /api/v1/dm_rooms/:id/read`)만 커서가 움직였다.
    #   그런데 화면 없이 API 로만 도는 자동봇은 방을 여는 일이 없어서, 그 봇에게
    #   보낸 메시지에는 "안 읽은 사람 1" 이 **영원히 남는다.**
    #
    #   "봇 계정" 플래그로 예외를 주지 않는다. 자동봇을 돌리는 계정이 사람도 함께
    #   쓰는 계정인 경우가 흔하다. 대신 사람에게도 옳은 규칙 하나를 세운다 — 그
    #   방에 글을 썼다는 것은 그때까지의 대화를 봤다는 뜻이다. 다른 기기에서
    #   답장했을 때 배지가 남던 것도 함께 사라진다.
    #
    #   커서를 `last_status_id` 가 아니라 **자기 글의 id** 로 민다. 내가 쓰는
    #   사이에 들어온 남의 메시지까지 읽음이 되면 안 된다.
    #
    #   조건부 UPDATE 보다 **앞**에 둔다. 그 사이 남이 더 최신 글을 썼으면 아래는
    #   0행을 고치고 빠져나가는데, 그때도 내 커서는 내 글까지 가 있어야 한다.
    #
    #   지연 귀속(resurrect: false)에서는 하지 않는다. 그쪽은 뒤늦게 발견한 과거
    #   이력이라 "지금 그 방을 보고 있다" 는 근거가 못 된다.
    mark_read_for_author!(status) if resurrect

    advanced = self.class
      .where(id: id)
      .where('last_status_id IS NULL OR last_status_id < ?', status.id)
      .update_all(last_status_id: status.id, updated_at: Time.now.utc)

    return if advanced.zero?

    reload
    refresh_root_status!

    # 나갔던 멤버를 되돌리는 것은 **새 메시지가 실제로 도착했을 때만** 이다.
    #
    # 조건부 UPDATE 가 0행을 고쳤다면 이미 아는 메시지를 다시 본 것이고, 조회 시점
    # 지연 귀속(resurrect: false)은 오래된 이력을 뒤늦게 붙이는 것이라 "새 메시지"가
    # 아니다. 둘 중 하나라도 되돌리면 방을 열어보기만 해도 나간 사람의 방이
    # 되살아난다. (FR-27, D-05)
    unhide_for_everyone! if resurrect
  end

  # 방의 루트 = last_status 가 속한 conversation 에서 살아 있는 가장 오래된 status.
  #
  # 방이 conversation 여럿을 묶으므로 "방의 루트" 가 자명하지 않다. 이 정의는
  # 삭제에 자기치유한다 — 루트가 지워지면 그 다음으로 오래된 것이 자동으로 루트가
  # 된다. 시간이 지나면 새 메시지가 한 conversation 에 모여 방과 conversation 이
  # 1:1 로 수렴한다.
  # 근거: dm-chat-decisions.md D-03, dm-chat-phase-1.md §4.3
  #
  # last_status 가 이 방에 붙지 않은 conversation 에 있으면 루트를 비운다. 그 안에서
  # 루트를 고르면 클라이언트가 남의 스레드에 답글을 달게 된다. 비워 두면 다음
  # 메시지가 새 스레드를 시작해 저절로 낫는다.
  def refresh_root_status!
    conversation_id = last_status&.conversation_id
    conversation_id = nil unless conversation_attached?(conversation_id)
    new_root_id     = conversation_id && oldest_room_status_id(conversation_id)

    return if new_root_id == root_status_id

    update_column(:root_status_id, new_root_id)
  end

  # 마지막 메시지가 지워지면 그 다음 것으로 되감는다. 외래키가 last_status_id 를
  # null 로 만들어 주므로 여기서는 "다시 채우는" 일만 한다.
  # 근거: 기획서 US-09
  def rewind_last_status!
    latest = latest_room_status_id

    # 창(STATUS_SCAN_LIMIT) 안에서 이 방의 메시지를 못 찾았다고 해서, 이미 있는 값을
    # null 로 덮지 않는다. 목록 쿼리가 last_status_id IS NULL 인 방을 빼기 때문에
    # 그러면 방이 통째로 사라진다.
    #
    # 못 찾는 경우가 실제로 있다. 같은 스레드에 다른 수신자 조합의 메시지가 창을
    # 가득 채우거나(제3자가 대량으로 답글을 달면 만들 수 있다), 상대 계정이 삭제되어
    # 멤버 행이 cascade 로 사라지면 어떤 과거 메시지도 참여자 조합이 맞지 않게 된다.
    # 그때는 미리보기가 낡을 뿐 방은 살아 있어야 한다.
    if latest.nil? && last_status_id.present?
      refresh_root_status!
      return
    end

    if latest != last_status_id
      update_columns(last_status_id: latest, updated_at: Time.now.utc)
      reload
    end

    # 조건 없이 부른다. last_status 가 그대로여도 루트가 지워졌을 수 있고, 그때
    # 갱신하지 않으면 root_status_id 가 null 로 남아 클라이언트가 새 스레드를
    # 시작해 버린다. (D-03 의 자기치유가 깨진다)
    refresh_root_status!
  end

  # 나갔던 멤버를 되돌린다. 새 메시지가 방에 붙는 것과 같은 트랜잭션에서 일어나야
  # "메시지는 왔는데 목록에 없는" 상태가 생기지 않는다. (FR-27)
  def unhide_for_everyone!
    dm_room_members.where.not(hidden_at: nil).update_all(hidden_at: nil, updated_at: Time.now.utc)
  end

  # 이 방에 **속한** 메시지. last_status 와 root_status 는 방 행 하나에 저장되어
  # 모든 멤버에게 똑같이 직렬화되므로, 여기에 아무 글이나 들어가면 안 된다.
  #
  # conversation_id 만으로 고르면 안 되는 이유: Status#set_conversation 은 답글이면
  # 공개 범위와 무관하게 부모의 conversation_id 를 물려준다. 그래서 DM 스레드 안에
  # 팔로워 공개 글이나, 멘션 구성이 다른(=다른 방의) direct 글이 섞여 들어온다.
  # 그것을 last_status 로 잡으면 방 목록이 그 내용을 전 멤버에게 그대로 보여준다.
  #
  # 판정은 참여자 조합이 이 방의 멤버와 정확히 같은가이다. 같다면 모든 멤버가
  # 작성자이거나 멘션 대상이므로 전원에게 보여도 안전하다.
  def room_statuses(conversation_id = nil)
    member_ids = dm_room_members.pluck(:account_id)

    scope = Status.direct_visibility
    scope = conversation_id ? scope.where(conversation_id: conversation_id) : scope.where(conversation_id: conversations.select(:id))

    # 참여자 조합이 정확히 일치하는지는 루비에서 확인하지만, 그 전에 SQL 에서 최대한
    # 걸러 둔다. 걸러 두지 않으면 같은 스레드에 다른 수신자를 향한 메시지가 창을
    # 가득 채웠을 때 이 방의 메시지를 하나도 못 찾는다. 제3자가 답글을 쏟아부어
    # 남의 방을 목록에서 지워버릴 수 있다.
    #
    #   작성자가 멤버여야 하고,
    #   멤버가 아닌 사람을 향한 멘션이 하나도 없어야 한다.
    #
    # 이 둘을 통과하면 참여자 집합이 멤버의 부분집합이 된다. 1대1 방에서는 그것으로
    # 이미 일치가 확정되고, 그룹 방에서는 루비 쪽 확인이 남은 차이를 잡는다.
    scope.where(account_id: member_ids)
      .where.not(id: Mention.active.where.not(account_id: member_ids).select(:status_id))
      .includes(:active_mentions)
  end

  def latest_room_status_id
    member_ids = dm_room_members.pluck(:account_id).sort

    room_statuses.reorder(id: :desc).limit(STATUS_SCAN_LIMIT)
      .find { |status| self.class.participants_for(status) == member_ids }&.id
  end

  def oldest_room_status_id(conversation_id)
    member_ids = dm_room_members.pluck(:account_id).sort

    room_statuses(conversation_id).reorder(id: :asc).limit(STATUS_SCAN_LIMIT)
      .find { |status| self.class.participants_for(status) == member_ids }&.id
  end

  # 이 방에서 account 가 볼 수 있는 메시지. 가시성을 쿼리에서 직접 강제한다.
  #
  # 멤버 확인만으로는 부족하다. 방에 다른 공개 범위의 글이 섞여 들어올 수 있고,
  # permitted_statuses_from_ids 가 쓰는 StatusFilter 는 차단·뮤트·침묵·키워드만
  # 보고 공개 범위는 보지 않는다.
  # 근거: dm-chat-phase-1.md §4.4, 기획서 §11.1
  def visible_statuses_for(account)
    scope = Status.where(conversation_id: conversations.select(:id)).direct_visibility

    visible = scope.where(account_id: account.id).or(
      scope.where(id: Mention.active.where(account_id: account.id).select(:status_id))
    )

    # "나에게서만 삭제" 한 글을 뺀다. (B-06, 마이그레이션 20260812000000)
    #
    # `.or` **밖에서** 건다. or 는 양쪽 관계의 구조가 같기를 요구해서, 한쪽에만
    # 조건을 더하면 ArgumentError 로 터진다.
    #
    # 안 읽은 개수(unread_count_for)도 이 메서드를 거친다. 그래서 숨긴 순간
    # 배지 숫자도 함께 줄어든다 — 읽지도 지우지도 못하는 유령 숫자가 남지 않는다.
    #
    # 차단·뮤트 관계인 사람의 글도 뺀다. 방은 아무나 만들 수 있으므로(상류의 DM 과
    # 같다), 여기서 걸러내지 않으면 차단한 사람의 메시지가 목록 미리보기로 새어 나온다.
    visible.where.not(id: DmHiddenStatus.status_ids_for(account))
      .where.not(account_id: account.excluded_from_timeline_account_ids)
  end

  # 본인을 뺀 참여자. 1대1 방에서는 상대 한 명이다.
  def other_accounts(account)
    members.reject { |member| member.id == account.id }
  end

  # 안 읽은 개수. 읽음 상태가 두 곳에 있으므로 둘을 화해시켜야 한다 (ADR-005).
  #
  # 우리 커서(dm_room_reads)와 상류의 account_conversations.unread 다. 공식 앱이
  # 기존 POST /conversations/:id/read 를 부르면 unread 만 꺼지고 커서는 그대로다.
  # 그때 우리 화면에 읽지 않음 배지가 남으면, 사용자는 "읽었는데 배지가 안 사라진다"
  # 고 느낀다 — US-07 이 지목한 최악의 상황이다.
  #
  # 판정 규칙: 커서가 없고, 이 방에 걸린 내 account_conversations 가 **전부**
  # unread=false 이면 외부 클라이언트에서 읽은 것으로 보고 0 을 보고한다. 하나라도
  # true 면 conversation 마다 독립적이므로 읽었다고 단정하지 않는다.
  # 근거: dm-chat-phase-1.md §4.6
  #
  # 세는 쿼리는 DmRoom.unread_counts_for 한 곳에만 있다. 목록과 방 하나의 응답이
  # 같은 숫자를 내야 하기 때문이다.
  def unread_count_for(account)
    self.class.unread_counts_for([self], account).fetch(id, 0)
  end

  UNREAD_CURSOR_JOIN = <<~SQL.squish # rubocop:disable I18n/RailsI18n/DecorateString -- SQL 이지 화면 문구가 아니다
    LEFT OUTER JOIN dm_room_reads
      ON dm_room_reads.dm_room_id = conversations.dm_room_id
     AND dm_room_reads.account_id = ?
  SQL

  class << self
    # 방 여럿의 안 읽은 개수를 `{ 방 id => 개수 }` 로 낸다. 결과에 없는 방은 0 이다.
    #
    # **방 수와 상관없이 쿼리 두 번이다.** 예전에는 방마다 count 를 따로 냈고(커서가
    # 없으면 화해 판정까지 세 번), 그 count 가 "나를 멘션한 모든 글" 을 서브쿼리로
    # 훑었다. 목록 한 번에 방 20개만큼 그것이 반복됐다.
    #
    # 조건은 visible_statuses_for 와 같다. 거기서 "내가 쓴 글" 갈래는 남의 글만
    # 세는 여기서는 어차피 걸러지므로 빼고, "나를 멘션한 글" 은 서브쿼리 대신
    # 조인으로 건다. 멘션은 (account_id, status_id) 가 유일해 행이 불어나지 않는다.
    def unread_counts_for(rooms, account)
      rooms = Array(rooms)
      return {} if rooms.empty?

      counted_ids = rooms.map(&:id) - legacy_read_room_ids(rooms_without_cursor(rooms, account), account)
      return {} if counted_ids.empty?

      unread_statuses_in(counted_ids, account).group('conversations.dm_room_id').count
    end

    private

    def rooms_without_cursor(rooms, account)
      # detect: 목록에서 dm_room_reads 를 프리로드하므로 방마다 쿼리를 다시 내지 않는다.
      rooms.select do |room|
        room.dm_room_reads.detect { |read| read.account_id == account.id }&.last_read_status_id.nil?
      end
    end

    # 커서가 없는 방 중, 이 방에 걸린 내 account_conversations 가 있고 **전부**
    # unread=false 인 방. 외부 클라이언트에서 읽은 것이다.
    def legacy_read_room_ids(rooms, account)
      return [] if rooms.empty?

      AccountConversation
        .joins(:conversation)
        .where(account_id: account.id, conversations: { dm_room_id: rooms.map(&:id) })
        .group('conversations.dm_room_id')
        .having('NOT bool_or(account_conversations.unread)')
        .pluck('conversations.dm_room_id')
    end

    # mentions.silent = false 는 Mention.active 와 같은 조건이다. merge 로 붙이지
    # 않는다 — merge 는 같은 이름의 컬럼(account_id) 조건을 덮어쓸 수 있다.
    def unread_statuses_in(room_ids, account)
      Status
        .direct_visibility
        .joins(:conversation, :mentions)
        .joins(sanitize_sql_array([UNREAD_CURSOR_JOIN, account.id]))
        .where(conversations: { dm_room_id: room_ids }, mentions: { account_id: account.id, silent: false })
        .where.not(account_id: account.id)
        .where.not(account_id: account.excluded_from_timeline_account_ids)
        .where.not(id: DmHiddenStatus.status_ids_for(account))
        .where('dm_room_reads.last_read_status_id IS NULL OR statuses.id > dm_room_reads.last_read_status_id')
        .reorder(nil)
    end
  end

  # ── 읽음 표시 (Phase 4) ────────────────────────────────────────────────────
  # 근거: docs/dm-chat/phases/dm-chat-phase-4.md §2.2~2.4, 기획서 §7.1·§11.2, FR-16·FR-18·FR-19

  # 이 방에서 account 에게 보여줄 "남들이 어디까지 읽었는가".
  #
  # **커서가 아니라 멤버를 돈다.** 화면이 "안 읽은 사람 수" 를 세기 때문이다 —
  # 아직 한 번도 안 읽은 사람이 목록에서 빠지면 **아무도 안 읽었는데 0 명이 되어
  # 숫자가 곧바로 사라진다.** 커서가 없으면 `last_read_status_id` 를 null 로 담고,
  # 클라이언트가 그것을 "아직 안 읽음" 으로 센다.
  #
  # 그래서 이 배열의 길이는 **읽음 표시를 켜 둔 다른 멤버 수**이고, 각 항목이
  # 어디까지 읽었는지를 말한다.
  #
  # **읽은 시각(read_at)을 담지 않는다.** 테이블에는 있지만 내보내지 않는다 —
  # 시각은 언제 접속했고 얼마나 자주 확인하는지를 드러낸다(기획서 §11.2). 필드를
  # 손으로 조립하는 이유가 그것이다. attributes 로 통째로 내보내면 read_at 이
  # 딸려 나간다.
  #
  # 상호주의(FR-19)는 **여기서** 판정한다. 클라이언트 판정은 우회 가능하다.
  # 읽음 표시를 끈 사람은 목록에서 빠지고, 그래서 **세는 대상에서도 빠진다** —
  # 알 수 없는 것을 "안 읽음" 으로 세면 그 숫자가 영영 0 이 되지 않는다.
  def participant_read_states_for(account)
    # 내가 껐으면 통째로 빈 배열. 필드를 없애지는 않는다 — 없어지면 설정 상태
    # 자체가 추론된다(§11.2).
    return [] unless read_receipts_enabled?(account)

    # 목록 응답에서 방마다 쿼리가 나가지 않게 프리로드한 것을 그대로 쓴다.
    cursors = dm_room_reads.index_by(&:account_id)

    members.filter_map do |member|
      # 내 커서는 최상위 last_read_status_id 로 이미 나간다. 두 번 내보내면
      # 클라이언트가 나를 "안 읽은 사람" 으로 셀 수 있다.
      next if member.id == account.id
      next unless read_receipts_enabled?(member)

      {
        account_id: member.id.to_s,
        last_read_status_id: cursors[member.id]&.last_read_status_id&.to_s,
      }
    end
  end

  # 읽음 이벤트를 방의 다른 멤버에게 발행한다. (FR-18)
  #
  # **커서가 실제로 전진했을 때만 부른다.** 무조건 부르면 방을 열어 둔 채 스크롤할
  # 때마다 같은 값이 계속 나간다.
  #
  # 워커를 두지 않는다. PushConversationWorker 는 InlineRenderer 로 대화 전체를
  # 그려야 해서 워커가 맞지만, 여기 페이로드는 **id 셋**이라 렌더링이 없다.
  # Sidekiq 을 한 번 왕복하면 이유 없는 지연만 더한다.
  #
  # 스트리밍 서버는 update / status.update 외의 이벤트를 **필터 없이 전달한다**
  # (streaming/index.js:646). 그러므로 걸러진 것만 발행해야 하는 책임이 여기 있다.
  def broadcast_read!(reader)
    # 읽은 사람이 껐으면 아무에게도 보내지 않는다.
    return unless read_receipts_enabled?(reader)

    cursor = dm_room_reads.find_by(account_id: reader.id)
    return if cursor&.last_read_status_id.blank?

    # payload 는 **Hash 로** 넘긴다. 스트리밍 서버의 transmit() 이 객체면
    # JSON.stringify 하고 문자열이면 그대로 보낸다(streaming/index.js:615).
    # PushConversationWorker 와 같은 형태이며, 프론트는 JSON.parse 로 받는다.
    message = {
      event: :'dm.read',
      payload: {
        dm_room_id: id.to_s,
        account_id: reader.id.to_s,
        last_read_status_id: cursor.last_read_status_id.to_s,
      },
    }.to_json

    # 받는 사람도 켜져 있어야 한다. 상호주의를 발행 단계에서도 건다 — 꺼 둔 사람은
    # 어차피 화면에 그리지 않으므로 보내면 대역폭만 쓴다.
    members.each do |member|
      next if member.id == reader.id
      next unless read_receipts_enabled?(member)

      redis.publish("timeline:direct:#{member.id}", message)
    end
  end

  # 글쓴이의 읽음 커서를 자기 글까지 민다. 근거는 register_status! 의 주석.
  #
  # 커서가 실제로 전진했을 때만 읽음 이벤트를 낸다 — 발행 조건은 방을 열 때와 같다.
  # 상호주의(읽음 표시를 끈 사람은 보내지도 받지도 않는다) 판정은 broadcast_read! 가
  # 하므로 여기서 다시 보지 않는다.
  #
  # 실패해도 메시지 자체는 남아야 한다. 커서는 다음 글이나 방 열기에서 따라잡는다.
  def mark_read_for_author!(status)
    cursor = read_cursor_for(status.account_id)

    broadcast_read!(status.account) if cursor.advance_to!(status.id)
  rescue ActiveRecord::ActiveRecordError => e
    Rails.logger.error { "DmRoom#mark_read_for_author! failed for status #{status.id}: #{e.class} #{e.message}" }
  end

  # 읽음 커서를 찾거나 만든다.
  #
  # **`create_or_find_by!` 를 쓰지 않는다.** 그쪽은 늘 INSERT 부터 하는데, 이 메서드는
  # 메시지마다 불리므로 첫 글 이후로는 매번 유니크 위반을 한 번씩 내고 넘어가게 된다.
  # 찾는 것이 먼저다.
  #
  # 만들 때는 세이브포인트를 판다. attach_status! 는 바깥 트랜잭션 안에서 불릴 수
  # 있고(PostStatusService · FanOutOnWriteService 가 **같은 글에 대해 동시에** 부른다),
  # 세이브포인트가 없으면 RecordNotUnique 가 트랜잭션 전체를 무효화해 아래 find_by!
  # 가 "current transaction is aborted" 로 다시 터진다. find_or_create_for 와 같은
  # 이유다.
  def read_cursor_for(account_id)
    existing = DmRoomRead.find_by(dm_room_id: id, account_id: account_id)
    return existing if existing

    self.class.transaction(requires_new: true) do
      DmRoomRead.create!(dm_room_id: id, account_id: account_id)
    end
  rescue ActiveRecord::RecordNotUnique
    DmRoomRead.find_by!(dm_room_id: id, account_id: account_id)
  end

  # ── 방 제목 (Phase 5) ─────────────────────────────────────────────────────
  # 근거: docs/dm-chat/phases/dm-chat-phase-5.md §3

  # 제목을 바꾸고, 실제로 바뀌었으면 시스템 메시지를 남긴다.
  #
  # **바뀌었을 때만 남긴다.** 같은 제목을 다시 저장하면 아무 일도 일어나지 않는다 —
  # 저장 버튼을 두 번 누른 것만으로 방에 안내문이 쌓이면 안 된다.
  #
  # 시스템 메시지 발행이 실패해도 제목 변경은 남긴다. 둘을 한 트랜잭션으로 묶으면
  # 속도 제한(429) 하나에 제목 변경 자체가 막힌다. 안내문이 없는 것보다 제목이
  # 안 바뀌는 쪽이 나쁘다.
  # ── 멤버 관리 (2026-08-12) ────────────────────────────────────────────────
  #
  # **방을 유지하고 참여자 조합만 바꾼다.** `participant_key` 를 다시 계산해 같은
  # 행에 쓰므로, 방 id 도 URL 도 이력도 그대로다.
  #
  # 새로 들어온 사람은 **들어오기 전 메시지를 볼 수 없다.** 따로 막은 것이 아니라
  # 저절로 그렇게 된다 — `visible_statuses_for` 가 "내가 썼거나 나를 멘션한 글"
  # 만 주는데, 옛 메시지에는 그 사람이 멘션되어 있지 않다.
  #
  # 나간 사람의 이력도 마찬가지로 남지만, 멤버십 행이 사라져 채팅 화면에서는
  # 방 자체가 열리지 않는다(Api::DmRoomAccess 가 404). 기존 /conversations 에서는
  # 계속 보인다.

  def member_ids
    dm_room_members.pluck(:account_id)
  end

  # 이 방에 속한다고 볼 참여자 조합들 — 멤버 전원, 그리고 익명화(글 남기고 탈퇴)된
  # 멤버를 뺀 명단.
  #
  # 익명화된 멤버는 방 JSON 에 acct `deleted` 로 나가서, 화면이 `@deleted` 를 붙여 보내도
  # ProcessMentionsService 가 해석하지 못하고 버린다. 그러면 남은 멤버의 메시지마다
  # 참여자가 멤버 전원과 달라져 방이 쪼개졌다. 옛 메시지는 그 멤버를 멘션하고 있으므로
  # 멤버 전원도 그대로 받는다.
  #
  # 같은 방인지 묻는 세 곳(thread_accepts?, attach_status!·history_of_another_room?,
  # RepairDmRoomThreadsService)이 모두 이것을 쓴다. 한 곳만 다르면 글이 조용히 옮겨진다.
  def accepted_participant_sets
    accounts = Account.where(id: dm_room_members.select(:account_id)).to_a
    all      = self.class.normalize_ids(accounts.map(&:id))
    live     = self.class.normalize_ids(accounts.reject(&:anonymized?).map(&:id))

    [all, live].uniq
  end

  def accepts_participants?(participant_ids)
    accepted_participant_sets.include?(participant_ids)
  end

  # 초대. 이미 있는 사람은 조용히 건너뛴다(멱등).
  #
  # **나갔던 사람을 다시 부르는 경우에는 조합이 바뀌지 않는다.** 그 사람의
  # 멤버십 행은 `hidden_at` 만 찍힌 채 남아 있어 여전히 참여자이기 때문이다.
  # 그때는 숨김만 풀고 키는 건드리지 않는다.
  def add_members!(author, account_ids)
    requested = self.class.normalize_ids(account_ids) - [author.id]
    return false if requested.empty?

    existing   = member_ids
    returning  = requested & existing
    incoming   = requested - existing

    raise Mastodon::ValidationError, I18n.t('dm_rooms.errors.too_many_recipients', max: MAX_MEMBERS - 1) if (existing | requested).size > MAX_MEMBERS

    # 나갔던 사람만 다시 부른 경우. 조합이 그대로라 키를 다시 쓰지 않는다.
    if incoming.empty?
      dm_room_members.where(account_id: returning).update_all(hidden_at: nil, updated_at: Time.now.utc)
      return false
    end

    new_ids = self.class.normalize_ids(existing + incoming)
    key     = self.class.participant_key_for(new_ids)
    clash   = self.class.find_by(participant_key: key)

    raise DuplicateRoomError, clash if clash && clash.id != id

    transaction do
      dm_room_members.where(account_id: returning).update_all(hidden_at: nil, updated_at: Time.now.utc) if returning.any?
      incoming.each { |account_id| dm_room_members.create!(account_id: account_id) }
      update!(participant_key: key, member_count: new_ids.size)
    end

    # 연관을 다시 읽어야 안내문이 **새 명단 전원**을 멘션한다. 한 명이라도 빠지면
    # 그 글이 더 작은 조합의 다른 방으로 간다.
    reload_members!
    post_member_event!(author, :added, Account.where(id: incoming).to_a)

    true
  end

  # 내보내기. 방장만 할 수 있다(컨트롤러가 검사한다).
  def remove_member!(author, target)
    return false unless dm_room_members.exists?(account_id: target.id)

    remaining = member_ids - [target.id]

    # 둘 미만이면 방이 성립하지 않는다. `participant_key_for` 도 한 명은 받지만
    # 그런 방은 목록에도 못 오르고 메시지도 붙지 않는다.
    raise Mastodon::ValidationError, I18n.t('dm_rooms.errors.last_members') if remaining.size < 2

    key   = self.class.participant_key_for(remaining)
    clash = self.class.find_by(participant_key: key)

    raise DuplicateRoomError, clash if clash && clash.id != id

    transaction do
      dm_room_members.where(account_id: target.id).destroy_all

      # 읽음 커서와 그 사람이 지정한 별명도 함께 지운다. 남겨두면 다시 초대됐을
      # 때 예전 커서가 되살아나 안 읽은 개수가 0 으로 시작한다.
      dm_room_reads.where(account_id: target.id).delete_all
      dm_room_nicknames.where(account_id: target.id).delete_all
      dm_room_nicknames.where(target_account_id: target.id).delete_all

      update!(participant_key: key, member_count: remaining.size)
    end

    reload_members!
    post_member_event!(author, :removed, [target])

    true
  end

  # 이 사람이 이 방에서 지정해 둔 별명들. `{ 대상 id(문자열) => 별명 }`.
  #
  # 목록은 dm_room_nicknames 를 미리 읽어 둔다(방마다 쿼리를 내지 않게). 그때는 메모리에서 고른다.
  def nicknames_for(account)
    rows = if dm_room_nicknames.loaded?
             dm_room_nicknames.select { |row| row.account_id == account.id }.map { |row| [row.target_account_id, row.nickname] }
           else
             dm_room_nicknames.where(account_id: account.id).pluck(:target_account_id, :nickname)
           end

    rows.to_h { |target_id, nickname| [target_id.to_s, nickname] }
  end

  # 별명을 정하거나(값 있음) 지운다(빈 값). 안내 메시지를 남기지 않는다 —
  # 지정한 사람에게만 보이는 값이라 방에 알릴 일이 아니다.
  def set_nickname!(account, target, nickname)
    trimmed = nickname.to_s.strip

    if trimmed.empty?
      dm_room_nicknames.where(account_id: account.id, target_account_id: target.id).delete_all
      return
    end

    # 만들 때부터 별명을 채운다. 빈 채로 INSERT 하면 presence 검증에 걸려 새 별명이
    # 하나도 저장되지 않는다(422).
    record = dm_room_nicknames.create_or_find_by!(account_id: account.id, target_account_id: target.id) { |row| row.nickname = trimmed }
    record.update!(nickname: trimmed)
  end

  def change_title!(author, new_title)
    normalized = new_title.to_s.strip.presence

    return false if normalized == title

    update!(title: normalized)
    post_title_event!(author, normalized)

    true
  end

  private

  # 참여자가 바뀌었을 때 `members` 캐시를 버린다. 안내문이 옛 명단을 멘션하면
  # 그 글은 이 방이 아니라 **다른 방**으로 간다.
  def reload_members!
    dm_room_members.reset
    members.reset
    reload
  end

  # 멤버 변경 안내를 방에 실제 메시지로 남긴다. 제목 변경과 같은 경로다.
  #
  # 이 글은 알림 이상의 일을 한다 — 바뀐 조합 전원을 멘션하므로, 옛 명단을 들고
  # 있던 다른 접속의 화면도 이 이벤트를 받아 방을 다시 읽는다.
  def post_member_event!(author, kind, targets)
    return if targets.empty?

    handles = other_accounts(author).map { |account| "@#{account.acct}" }.join(' ')
    names   = targets.map { |account| author_name(account) }.join(', ')

    body = I18n.t(
      kind == :added ? 'dm_rooms.member_added' : 'dm_rooms.member_removed',
      name: author_name(author),
      targets: names,
      locale: EVENT_LOCALE
    )

    PostStatusService.new.call(
      author,
      text: [handles, body].compact_blank.join(' '),
      visibility: :direct,
      spoiler_text: MEMBER_EVENT_PREFIX,
      thread: root_status,
      with_rate_limit: true,
      dm_room_event: true
    )
  rescue Mastodon::RateLimitExceededError,
         Mastodon::ValidationError,
         PostStatusService::UnexpectedMentionsError,
         ActiveRecord::RecordInvalid => e
    # 멤버는 이미 바뀌었다. 안내문만 없는 상태로 두고 넘어간다 — 제목 변경과
    # 같은 판단이다(바로 아래 주석).
    #
    # **대가가 제목보다 크다.** 안내문이 없으면 다른 접속이 옛 명단을 계속 들고
    # 있다가, 그 명단으로 보낸 메시지가 더 작은 조합의 다른 방으로 샌다. 다만
    # 스트림의 방 목록 갱신과 방 재조회가 곧 따라잡으므로 창이 짧고, 여기서
    # 500 을 내면 멤버는 바뀌었는데 실패로 보이는 더 나쁜 상태가 된다.
    Rails.logger.warn { "dm_room #{id}: member event not posted (#{e.class})" }
    nil
  end

  # 제목 변경 안내를 방에 실제 메시지로 남긴다.
  #
  # 멤버 전원을 멘션해야 이 방으로 귀속된다 — 참여자 조합이 곧 방이기 때문이다
  # (participant_key). 하나라도 빠지면 더 작은 조합의 **다른 방**으로 간다.
  #
  # thread 를 방의 루트로 잡아 conversation 이 새로 생기지 않게 한다.
  def post_title_event!(author, new_title)
    handles = other_accounts(author).map { |account| "@#{account.acct}" }.join(' ')

    body = if new_title
             I18n.t('dm_rooms.title_changed', name: author_name(author), title: new_title, locale: EVENT_LOCALE)
           else
             I18n.t('dm_rooms.title_removed', name: author_name(author), locale: EVENT_LOCALE)
           end

    PostStatusService.new.call(
      author,
      text: [handles, body].compact_blank.join(' '),
      visibility: :direct,
      spoiler_text: TITLE_EVENT_PREFIX,
      thread: root_status,

      # 속도 제한을 건다. 이 엔드포인트는 제목이 실제로 바뀔 때만 글을 남기지만,
      # 제목을 번갈아 바꾸면 반복할 수 있다. DM 제한(1000/시간)에 묶어 둔다.
      with_rate_limit: true,
      dm_room_event: true
    )
  rescue Mastodon::RateLimitExceededError,
         Mastodon::ValidationError,
         PostStatusService::UnexpectedMentionsError,
         ActiveRecord::RecordInvalid => e
    # 제목은 이미 바뀌었다. 안내문만 없는 상태로 두고 넘어간다.
    #
    # 네 가지를 다 잡는 이유는, 이 경로가 사용자 입력(제목)을 본문에 싣기 때문이다.
    # 속도 제한·안티스팸·멘션 검증 어느 것에 걸려도 **제목 변경 자체가 500 이 되면
    # 안 된다.** 안내문이 없는 것보다 제목이 안 바뀌는 쪽이 나쁘다.
    Rails.logger.warn { "dm_room #{id}: title event not posted (#{e.class})" }
    nil
  end

  def author_name(author)
    author.display_name.presence || author.username
  end

  # user 가 없는 계정(익명 처리·원격)은 **꺼진 것으로 본다.** 모르는 것을 켜진 쪽으로
  # 가정하면 노출이 기본값이 된다.
  #
  # private 이다. 상호주의 판정이 바깥으로 새면 호출하는 쪽마다 조건을 다시 쓰게
  # 되고, 그중 하나가 빠지면 그 경로에서만 노출된다. 판정은 이 클래스 안에만 있다.
  def read_receipts_enabled?(account)
    account.user&.settings&.[]('dm_read_receipts') == true
  end
end
