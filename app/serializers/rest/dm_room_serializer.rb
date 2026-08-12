# frozen_string_literal: true

# @_longwhile custom feature
class REST::DmRoomSerializer < ActiveModel::Serializer
  attributes :id, :unread_count, :root_status_id, :last_read_status_id,
             :is_group, :is_local, :title, :participant_read_states,
             :creator_id, :nicknames

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

  def participant_read_states
    object.participant_read_states_for(current_account)
  end

  def last_status
    status = object.last_status

    return status if status.nil? || hidden_status_ids.exclude?(status.id)

    object.visible_statuses_for(current_account).reorder(id: :desc).first
  end

  def creator_id
    object.creator_id&.to_s
  end

  def nicknames
    object.nicknames_for(current_account)
  end

  private

  def hidden_status_ids
    instance_options[:hidden_status_ids] || []
  end

  def read_cursor
    return @read_cursor if defined?(@read_cursor)

    @read_cursor = object.dm_room_reads.detect { |cursor| cursor.account_id == current_account.id }
  end

  def current_account
    instance_options[:current_account]
  end
end
