# frozen_string_literal: true

class REST::ThreadHeadSerializer < ActiveModel::Serializer
  attributes :status_id, :omitted_count

  belongs_to :head, serializer: REST::StatusSerializer

  def status_id
    object.status_id.to_s
  end
end
