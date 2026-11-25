# frozen_string_literal: true

class REST::BookmarkDetailSerializer < ActiveModel::Serializer
  attributes :status_id, :note, :folder_ids

  def status_id
    object.status_id.to_s
  end

  def note
    object.note || ''
  end

  def folder_ids
    object.bookmark_folder_items.map { |item| item.bookmark_folder_id.to_s }.sort_by(&:to_i)
  end
end
