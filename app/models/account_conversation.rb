# frozen_string_literal: true

# == Schema Information
#
# Table name: account_conversations
#
#  id                      :bigint(8)        not null, primary key
#  lock_version            :integer          default(0), not null
#  participant_account_ids :bigint(8)        default([]), not null, is an Array
#  status_ids              :bigint(8)        default([]), not null, is an Array
#  unread                  :boolean          default(FALSE), not null
#  account_id              :bigint(8)        not null
#  conversation_id         :bigint(8)        not null
#  last_status_id          :bigint(8)
#

class AccountConversation < ApplicationRecord
  include Redisable

  # @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
  #   status_ids 는 저장할 때마다 전체가 정렬되고 행이 통째로 재기록된다. 타임라인
  #   DM 은 스레드당 수십 건이라 문제가 없었지만, 채팅은 방당 수천~수만 건이 쌓인다.
  #   메시지 하나 보낼 때마다 수천 원소를 정렬하게 되므로 최근 N건으로 제한한다.
  #
  #   잘라도 사용자가 보는 것은 줄지 않는다. 대화 목록이 직렬화하는 것은 last_status
  #   하나뿐이고(Api::V1::ConversationsController#index), 스레드 본문은 context API 가
  #   conversation_id 가 아니라 in_reply_to_id 체인으로 가져온다.
  #
  #   STATUS_IDS_LIMIT=0 이면 제한하지 않는다. 코드 배포 없이 되돌리기 위한 스위치다.
  #   근거: dm-chat-phase-0.md §2, dm-chat-decisions.md D-04
  #   `.to_i` 를 쓰지 않는다. 오타("100 " 같은 값)가 0 으로 읽히면 상한이 조용히
  #   풀려 이 패치가 통째로 무력화된다. 해석할 수 없거나 음수면 기본값으로 되돌린다.
  #   0 만이 "무제한" 이고, 그것은 명시적으로 적었을 때만 인정한다.
  STATUS_IDS_LIMIT = begin
    parsed = Integer(ENV.fetch('STATUS_IDS_LIMIT', '100'), exception: false)
    parsed.nil? || parsed.negative? ? 100 : parsed
  end

  # 되채움이 한 번에 훑을 최대 행 수. 참여자 조합 비교를 루비에서 하므로 무한정 읽을
  # 수 없다. 상한의 10배까지 보되 최소 1000행은 확보한다.
  # STATUS_IDS_LIMIT=0(무제한)이면 창을 두지 않는다 — 그때는 재구성 rake 가 전부를
  # 되찾아야 하고, 창을 두면 복구 도구가 오히려 데이터를 자른다.
  REFILL_SCAN_LIMIT = STATUS_IDS_LIMIT.positive? ? [STATUS_IDS_LIMIT * 10, 1_000].max : nil

  attr_writer :participant_accounts

  before_validation :set_last_status
  after_commit :push_to_streaming_api

  belongs_to :account
  belongs_to :conversation
  belongs_to :last_status, class_name: 'Status'

  def participant_account_ids=(arr)
    self[:participant_account_ids] = arr.sort
    @participant_accounts = nil
  end

  def participant_accounts
    @participant_accounts ||= Account.where(id: participant_account_ids).to_a
    @participant_accounts.presence || [account]
  end

  class << self
    def to_a_paginated_by_id(limit, options = {})
      array = begin
        if options[:min_id]
          paginate_by_min_id(limit, options[:min_id], options[:max_id]).reverse
        else
          paginate_by_max_id(limit, options[:max_id], options[:since_id]).to_a
        end
      end

      # Preload participants
      participant_ids = array.flat_map(&:participant_account_ids)
      accounts_by_id = Account.where(id: participant_ids).index_by(&:id)

      array.each do |conversation|
        conversation.participant_accounts = conversation.participant_account_ids.filter_map { |id| accounts_by_id[id] }
      end

      array
    end

    def paginate_by_min_id(limit, min_id = nil, max_id = nil)
      query = order(arel_table[:last_status_id].asc).limit(limit)
      query = query.where(arel_table[:last_status_id].gt(min_id)) if min_id.present?
      query = query.where(arel_table[:last_status_id].lt(max_id)) if max_id.present?
      query
    end

    def paginate_by_max_id(limit, max_id = nil, since_id = nil)
      query = order(arel_table[:last_status_id].desc).limit(limit)
      query = query.where(arel_table[:last_status_id].lt(max_id)) if max_id.present?
      query = query.where(arel_table[:last_status_id].gt(since_id)) if since_id.present?
      query
    end

    def add_status(recipient, status)
      conversation = find_or_initialize_by(account: recipient, conversation_id: status.conversation_id, participant_account_ids: participants_from_status(recipient, status))

      return conversation if conversation.status_ids.include?(status.id)

      conversation.status_ids << status.id
      conversation.unread = status.account_id != recipient.id
      conversation.save
      conversation
    rescue ActiveRecord::StaleObjectError
      retry
    end

    def remove_status(recipient, status)
      conversation = find_by(account: recipient, conversation_id: status.conversation_id, participant_account_ids: participants_from_status(recipient, status))

      return if conversation.nil?

      conversation.status_ids.delete(status.id)

      # STATUS_IDS_LIMIT 이 걸린 뒤로 status_ids 는 대화 전체가 아니라 최근 N건이다.
      # 배열이 비었다고 대화가 빈 것이 아니므로, 곧바로 destroy 하면 오래된 메시지가
      # 남아 있는 살아 있는 대화를 지우게 된다. DB 에서 다시 채워보고 정말 0건일
      # 때에만 삭제한다. (dm-chat-phase-0.md §2.2)
      #
      # 남는 위험 하나: BatchedRemoveStatusService 와 Vacuum::StatusesVacuum 은
      # 배치의 모든 direct status 에 대해 unlink 를 먼저 돌린 뒤 한꺼번에 delete_all
      # 한다. 그 사이에는 아직 지워지지 않은 배치 동료가 DB 에 살아 있으므로, 되채움이
      # 그것을 골라 last_status_id 로 삼을 수 있고 곧 사라져 참조가 뜬다
      # (account_conversations.last_status_id 에는 외래키가 없다).
      #
      # 그래도 되채운다. 되채우지 않으면 "상대 계정을 지웠더니 내 대화가 통째로
      # 사라지는" 확실한 데이터 손실이 생기는데, 이쪽이 훨씬 흔하고 사용자에게 보인다.
      # 뜬 참조는 `bin/rails dm:rebuild_status_ids` 로 복구할 수 있다.
      conversation.status_ids = remaining_status_ids(conversation, except: status.id) if conversation.status_ids.empty?

      if conversation.status_ids.empty?
        conversation.destroy
      else
        conversation.save
      end

      conversation
    rescue ActiveRecord::StaleObjectError
      retry
    end

    # 이 대화 행에 남아 있는 메시지 id 를 최근 것부터 STATUS_IDS_LIMIT 건까지 되찾는다.
    # add_status 가 담는 것과 같은 집합을 재구성한다 — 같은 conversation 에 속하면서,
    # 본인이 쓴 글이거나 본인이 (silent 가 아닌) 멘션을 받은 글이면서, 참여자 조합이
    # 이 행과 일치하는 글.
    #
    # 참여자 조합까지 봐야 하는 이유: 하나의 (account_id, conversation_id) 에 대해
    # 참여자 조합이 다른 행이 여럿 존재할 수 있다(add_status 가 세 컬럼으로 찾는다).
    # conversation_id 만으로 되찾으면 옆 행의 메시지를 끌어와 두 대화가 같은
    # last_status 를 가리키게 된다.
    #
    # 호출 지점은 둘이다. remove_status 의 되채움(드문 경로)과 `dm:rebuild_status_ids`
    # rake(상한 롤백용). STATUS_IDS_LIMIT=0 이면 전부 되찾으므로 rake 로 원상 복구가
    # 가능하다. (dm-chat-phase-0.md §2.4)
    def remaining_status_ids(conversation, except: nil)
      scope = Status.where(conversation_id: conversation.conversation_id)
      scope = scope.where.not(id: except) if except.present?

      mine  = scope.where(account_id: conversation.account_id)
      to_me = scope.where(id: Mention.active.where(account_id: conversation.account_id).select(:status_id))

      candidates = mine.or(to_me).reorder(id: :desc).includes(:active_mentions)
      candidates = candidates.limit(REFILL_SCAN_LIMIT) if REFILL_SCAN_LIMIT

      matching = candidates.select { |status| participants_of(conversation.account_id, status) == conversation.participant_account_ids }
      matching = matching.first(STATUS_IDS_LIMIT) if STATUS_IDS_LIMIT.positive?
      matching.map(&:id).sort
    end

    private

    def participants_from_status(recipient, status)
      participant_ids_for(recipient.id, status.account_id, status.active_mentions.pluck(:account_id))
    end

    # 되채움 경로는 active_mentions 를 프리로드해 두므로 pluck 대신 map 으로 읽는다.
    # 두 경로가 같은 식을 쓰도록 계산을 한 곳에 모은다.
    def participants_of(recipient_id, status)
      participant_ids_for(recipient_id, status.account_id, status.active_mentions.map(&:account_id))
    end

    def participant_ids_for(recipient_id, author_id, mentioned_ids)
      ((mentioned_ids + [author_id]).uniq - [recipient_id]).sort
    end
  end

  private

  # status_ids 의 정규화를 한 곳에 모은다. add_status 의 append, remove_status 의
  # 되채움, 백필 등 모든 쓰기 경로가 이 콜백을 지나므로 여기만 지키면 된다.
  #
  # uniq 가 필요한 이유: add_status 의 중복 가드(`status_ids.include?`)는 그 id 가
  # 배열에 남아 있어야 동작한다. 상한 때문에 밀려난 오래된 id 에 대해서는 가드가
  # 동작하지 않으므로, Sidekiq 재시도로 같은 id 가 다시 append 될 수 있다.
  # (dm-chat-phase-0.md §2.1, 검토 S-5)
  def set_last_status
    self.status_ids     = limited_status_ids
    self.last_status_id = status_ids.last
  end

  def limited_status_ids
    ids = status_ids.uniq.sort
    return ids unless STATUS_IDS_LIMIT.positive?

    ids.last(STATUS_IDS_LIMIT)
  end

  def push_to_streaming_api
    return if destroyed? || !subscribed_to_timeline?

    PushConversationWorker.perform_async(id)
  end

  def subscribed_to_timeline?
    redis.exists?("subscribed:#{streaming_channel}")
  end

  def streaming_channel
    "timeline:direct:#{account_id}"
  end
end
