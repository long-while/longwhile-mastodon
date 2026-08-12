# frozen_string_literal: true

# @_longwhile custom feature
class REST::Admin::DmRoomSerializer < ActiveModel::Serializer
  attributes :id, :unread_count, :root_status_id, :last_read_status_id,
             :is_group, :is_local, :title

  has_many :members, key: :accounts, serializer: REST::AccountSerializer
  has_one :last_status, serializer: REST::StatusSerializer

  def id
    object.id.to_s
  end

  def root_status_id
    object.root_status_id&.to_s
  end

  def unread_count
    0
  end

  def last_read_status_id
    nil
  end

  def is_group # rubocop:disable Naming/PredicatePrefix
    object.group?
  end

  def is_local # rubocop:disable Naming/PredicatePrefix
    object.members.all?(&:local?)
  end
end
