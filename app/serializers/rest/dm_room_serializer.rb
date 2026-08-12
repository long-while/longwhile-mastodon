# frozen_string_literal: true

# @_longwhile custom feature
class REST::DmRoomSerializer < ActiveModel::Serializer
  attributes :id, :unread_count, :root_status_id, :last_read_status_id,
             :is_group, :is_local, :title

  has_many :other_accounts, key: :accounts, serializer: REST::AccountSerializer
  has_one :last_status, serializer: REST::StatusSerializer

  def id
    object.id.to_s
  end

  def root_status_id
    object.root_status_id&.to_s
  end

  def last_read_status_id
    read_cursor&.last_read_status_id&.to_s
  end

  def unread_count
    object.unread_count_for(current_account)
  end

  def is_group # rubocop:disable Naming/PredicatePrefix
    object.group?
  end

  def is_local # rubocop:disable Naming/PredicatePrefix
    object.other_accounts(current_account).all?(&:local?)
  end

  def other_accounts
    object.other_accounts(current_account)
  end

  private

  def read_cursor
    return @read_cursor if defined?(@read_cursor)

    @read_cursor = object.dm_room_reads.detect { |cursor| cursor.account_id == current_account.id }
  end

  def current_account
    instance_options[:current_account]
  end
end
