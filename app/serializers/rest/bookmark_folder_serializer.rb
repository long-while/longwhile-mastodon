# frozen_string_literal: true

class REST::BookmarkFolderSerializer < ActiveModel::Serializer
  attributes :id, :name, :position

  def id
    object.id.to_s
  end
end
