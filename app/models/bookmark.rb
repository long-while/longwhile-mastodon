# frozen_string_literal: true

# == Schema Information
#
# Table name: bookmarks
#
#  id         :bigint(8)        not null, primary key
#  note       :text
#  created_at :datetime         not null
#  updated_at :datetime         not null
#  account_id :bigint(8)        not null
#  status_id  :bigint(8)        not null
#

class Bookmark < ApplicationRecord
  include Paginable

  NOTE_LENGTH_LIMIT = 500

  update_index('statuses', :status) if Chewy.enabled?

  belongs_to :account, inverse_of: :bookmarks
  belongs_to :status,  inverse_of: :bookmarks

  has_many :bookmark_folder_items, dependent: :delete_all

  validates :status_id, uniqueness: { scope: :account_id }
  validate :validate_note_length

  normalizes :note, with: ->(note) { note.gsub(BookmarkFolder::EDGE_BLANKS, '').presence }

  before_validation do
    self.status = status.reblog if status&.reblog?
  end

  after_destroy :invalidate_cleanup_info

  def invalidate_cleanup_info
    return unless status&.account_id == account_id && account.local?

    account.statuses_cleanup_policy&.invalidate_last_inspected(status, :unbookmark)
  end

  private

  def validate_note_length
    return if note.nil? || note.length <= NOTE_LENGTH_LIMIT

    errors.add(:base, I18n.t('bookmarks.errors.note_too_long', limit: NOTE_LENGTH_LIMIT))
  end
end
