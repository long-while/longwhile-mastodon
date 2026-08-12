# frozen_string_literal: true

# == Schema Information
#
# Table name: conversations
#
#  id         :bigint(8)        not null, primary key
#  uri        :string
#  created_at :datetime         not null
#  updated_at :datetime         not null
#  dm_room_id :bigint(8)
#

class Conversation < ApplicationRecord
  validates :uri, uniqueness: true, if: :uri?

  has_many :statuses, dependent: nil

  belongs_to :dm_room, optional: true, inverse_of: :conversations

  def local?
    uri.nil?
  end
end
