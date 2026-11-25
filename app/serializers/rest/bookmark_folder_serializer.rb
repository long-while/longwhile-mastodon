# frozen_string_literal: true

class REST::BookmarkFolderSerializer < ActiveModel::Serializer
  attributes :id, :name, :position, :statuses_count

  def id
    object.id.to_s
  end

  def statuses_count
    counts = instance_options[:statuses_counts] || BookmarkFolder.statuses_counts([object.id])
    counts.fetch(object.id, 0)
  end
end
