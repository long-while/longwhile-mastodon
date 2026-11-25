# frozen_string_literal: true

# == Schema Information
#
# Table name: bookmark_folders
#
#  id         :bigint(8)        not null, primary key
#  name       :string           not null
#  position   :integer          default(0), not null
#  created_at :datetime         not null
#  updated_at :datetime         not null
#  account_id :bigint(8)        not null
#

class BookmarkFolder < ApplicationRecord
  PER_ACCOUNT_LIMIT = 50
  NAME_LENGTH_LIMIT = 30

  EDGE_BLANKS = /\A[[:space:]\u00A0\u3000\u200B-\u200D\u2060\uFEFF]+|[[:space:]\u00A0\u3000\u200B-\u200D\u2060\uFEFF]+\z/

  belongs_to :account
  has_many :bookmark_folder_items, dependent: :delete_all
  has_many :bookmarks, through: :bookmark_folder_items

  validates :name, presence: true, length: { maximum: NAME_LENGTH_LIMIT }
  validate :validate_account_folders_limit, on: :create

  before_create :place_last

  scope :ordered, -> { order(:position, :id) }

  normalizes :name, with: ->(name) { name.gsub(EDGE_BLANKS, '') }

  def self.id_list?(ids)
    ids.is_a?(Array) && ids.all? { |id| id.is_a?(Integer) || (id.is_a?(String) && id.match?(/\A\d+\z/)) }
  end

  def self.order_list?(ids)
    id_list?(ids) && ids.size <= PER_ACCOUNT_LIMIT && ids.map(&:to_i).uniq.size == ids.size
  end

  def self.with_account_lock(account)
    transaction do
      connection.execute(sanitize_sql_array(['SELECT pg_advisory_xact_lock(hashtextextended(?, 0))', "#{table_name}:#{account.id}"]))
      yield
    end
  end

  def self.create_for!(account, attributes)
    with_account_lock(account) { account.bookmark_folders.create!(attributes) }
  end

  def self.reorder!(account, ids)
    ids = ids.map(&:to_i)

    with_account_lock(account) do
      next false unless ids.sort == account.bookmark_folders.pluck(:id).sort

      update_positions!(account, ids)
      true
    end
  end

  def self.update_positions!(account, ids)
    return if ids.empty?

    rows = ids.each_with_index.map { |id, position| sanitize_sql_array(['(?::bigint, ?::integer)', id, position]) }
    sql = "UPDATE #{table_name} SET position = v.position FROM (VALUES #{rows.join(', ')}) AS v(id, position) WHERE #{table_name}.id = v.id AND #{table_name}.account_id = ?"
    connection.execute(sanitize_sql_array([sql, account.id]))
  end
  private_class_method :update_positions!

  private

  def validate_account_folders_limit
    return unless account && account.bookmark_folders.count >= PER_ACCOUNT_LIMIT

    errors.add(:base, I18n.t('bookmark_folders.errors.limit', limit: PER_ACCOUNT_LIMIT))
  end

  def place_last
    self.position = (account.bookmark_folders.maximum(:position) || -1) + 1
  end
end
