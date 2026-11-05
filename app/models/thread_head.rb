# frozen_string_literal: true

# @_longwhile — 홈·퍼블릭 타임라인에서 답글 위에 스레드의 시작을 붙여 보여 주기 위한 것(X 처럼).
#
#   답글 하나마다 "보는 사람이 볼 수 있는 조상" 중 맨 위의 글(head)과, 그 글과 답글 사이에
#   끼어 있는 볼 수 있는 글의 수(omitted_count)를 준다. 볼 수 없는 조상은 없는 것으로 친다 —
#   맨 위 글이 안 보이면 그 아래에서 처음 보이는 글이 head 가 된다. 판정은 글 주소·대화 보기와
#   같은 `Status.permitted_statuses_from_ids`(StatusPolicy#show? + 차단·뮤트)를 쓴다.
#
#   미리보기는 "사회적 보기" 라 운영진 열람 특권을 쓰지 않는다. 운영진에게도 팔로우 관계·공개
#   범위로만 판정한다(SocialStatusPolicy). 대화 보기·글 주소의 운영진 열람은 그대로다.
#   DM(direct·limited)도 타임라인 미리보기에 끼지 않는다 — 내가 받은 DM 이라도 마찬가지다.
class ThreadHead < ActiveModelSerializers::Model
  attributes :status_id, :head, :omitted_count

  # StatusPolicy#show? 의 운영진 우회(`return true if administrator?`)만 끈 것. 우회는 보이는 범위를
  # 넓히기만 하므로, permitted_statuses_from_ids 위에 이 판정을 한 번 더 걸면 일반 사용자 결과가 된다.
  class SocialStatusPolicy < StatusPolicy
    private

    def administrator?
      false
    end
  end

  # 대화 보기(`Api::V1::Statuses::ContextsController::CONTEXT_LIMIT`)와 같은 깊이까지 올라간다.
  # 그보다 긴 사슬이면 head 는 진짜 맨 위가 아니라 이 깊이에서 처음 보이는 글이다.
  MAX_DEPTH = 4_096

  HIDDEN_VISIBILITIES = %w(direct limited).freeze

  class << self
    # 요청한 순서대로, head 가 있는 것만 돌려준다.
    def for_statuses(status_ids, account)
      chains  = ancestor_chains(status_ids)
      visible = visible_statuses(chains.values.flatten.uniq, account)

      status_ids.filter_map do |status_id|
        chain = chains[status_id]
        next if chain.nil? || chain.size < 2 || !visible.key?(status_id)

        build(status_id, chain.drop(1).filter_map { |id| visible[id] })
      end
    end

    private

    def build(status_id, visible_ancestors)
      return if visible_ancestors.empty?

      new(status_id: status_id, head: visible_ancestors.first, omitted_count: visible_ancestors.size - 1)
    end

    # { 요청한 id => [요청한 id, 맨 위 id, …, 부모 id] } — 요청한 글 뒤에 조상을 위에서부터 적는다.
    # 답글이 아니면 [요청한 id] 하나뿐이고, 없는 글이면 키가 없다.
    def ancestor_chains(status_ids)
      return {} if status_ids.empty?

      rows = Status.connection.select_rows(Status.sanitize_sql_array([ANCESTORS_SQL, { ids: status_ids, max_depth: MAX_DEPTH }]))

      rows.group_by { |origin, _id, _depth| origin.to_i }.transform_values do |origin_rows|
        ordered = origin_rows.sort_by { |_origin, _id, depth| depth.to_i }.map { |_origin, id, _depth| id.to_i }
        [ordered.first] + ordered.drop(1).reverse
      end
    end

    def visible_statuses(ids, account)
      statuses = Status.permitted_statuses_from_ids(ids, account)
      statuses.select { |status| shown_in_preview?(status, account) }.index_by(&:id)
    end

    def shown_in_preview?(status, account)
      HIDDEN_VISIBILITIES.exclude?(status.visibility) && SocialStatusPolicy.new(account, status).show?
    end
  end

  # 원본 글은 지워졌어도(deleted_at) 사슬은 그 위로 이어 간다 — 상류 `ancestor_statuses` 와 같다.
  # 지워진 글은 visible_statuses 의 기본 스코프(kept)가 빼 준다.
  ANCESTORS_SQL = <<~SQL.squish
    WITH RECURSIVE search_tree(origin, id, in_reply_to_id, depth, path) AS (
      SELECT id, id, in_reply_to_id, 0, ARRAY[id]
      FROM statuses
      WHERE id IN (:ids)
    UNION ALL
      SELECT search_tree.origin, statuses.id, statuses.in_reply_to_id, search_tree.depth + 1, search_tree.path || statuses.id
      FROM search_tree
      JOIN statuses ON statuses.id = search_tree.in_reply_to_id
      WHERE search_tree.depth < :max_depth AND NOT statuses.id = ANY(search_tree.path)
    )
    SELECT origin, id, depth FROM search_tree
  SQL
end
