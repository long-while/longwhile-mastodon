# frozen_string_literal: true

class ThreadHead < ActiveModelSerializers::Model
  attributes :status_id, :head, :omitted_count

  class SocialStatusPolicy < StatusPolicy
    private

    def administrator?
      false
    end
  end

  MAX_DEPTH = 4_096

  HIDDEN_VISIBILITIES = %w(direct limited).freeze

  class << self
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
