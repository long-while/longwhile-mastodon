# frozen_string_literal: true

# == Schema Information
#
# Table name: multi_account_links
#
#  id           :bigint(8)        not null, primary key
#  created_at   :datetime         not null
#  updated_at   :datetime         not null
#  peer_user_id :bigint(8)        not null
#  user_id      :bigint(8)        not null
#

class MultiAccountLink < ApplicationRecord
  belongs_to :user
  belongs_to :peer_user, class_name: 'User'

  LOCK_KEY = 0x4d414c4b # 'MALK'

  MAX_GROUP_SIZE = 20

  class GroupTooLargeError < StandardError; end

  class << self
    def link!(user_id, other_user_id)
      return if user_id.blank? || other_user_id.blank? || user_id == other_user_id

      transaction do
        lock_groups!
        members = [user_id, other_user_id] | peer_ids_of(user_id) | peer_ids_of(other_user_id)
        rows = missing_rows(members)
        next if rows.empty?

        raise GroupTooLargeError, "group of #{members.size} exceeds #{MAX_GROUP_SIZE}" if members.size > MAX_GROUP_SIZE

        insert_all(rows, unique_by: [:user_id, :peer_user_id])
      end
    end

    def linked?(user_id, other_user_id)
      return false if user_id.blank? || other_user_id.blank?
      return true if user_id == other_user_id

      exists?(user_id: user_id, peer_user_id: other_user_id)
    end

    def peer_ids_of(user_id)
      where(user_id: user_id).pluck(:peer_user_id)
    end

    def unlink_all!(user_id)
      transaction do
        lock_groups!
        where(user_id: user_id).or(where(peer_user_id: user_id)).delete_all
      end
    end

    private

    def missing_rows(members)
      existing = where(user_id: members, peer_user_id: members).pluck(:user_id, :peer_user_id).to_set
      now = Time.now.utc

      members.permutation(2).filter_map do |a, b|
        next if existing.include?([a, b])

        { user_id: a, peer_user_id: b, created_at: now, updated_at: now }
      end
    end

    def lock_groups!
      connection.execute("SELECT pg_advisory_xact_lock(#{LOCK_KEY})")
    end
  end
end
