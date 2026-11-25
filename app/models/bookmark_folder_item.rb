# frozen_string_literal: true

# == Schema Information
#
# Table name: bookmark_folder_items
#
#  id                 :bigint(8)        not null, primary key
#  created_at         :datetime         not null
#  updated_at         :datetime         not null
#  bookmark_folder_id :bigint(8)        not null
#  bookmark_id        :bigint(8)        not null
#

class BookmarkFolderItem < ApplicationRecord
  belongs_to :bookmark_folder
  belongs_to :bookmark

  validates :bookmark_id, uniqueness: { scope: :bookmark_folder_id }
  validate :validate_same_owner

  private

  def validate_same_owner
    return if bookmark.nil? || bookmark_folder.nil?
    return if bookmark.account_id == bookmark_folder.account_id

    errors.add(:bookmark, :invalid)
  end
end
