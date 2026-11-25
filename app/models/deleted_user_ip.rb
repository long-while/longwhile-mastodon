# frozen_string_literal: true

# == Schema Information
#
# Table name: deleted_user_ips
#
#  id                     :bigint(8)        not null, primary key
#  ip                     :inet             not null
#  used_at                :datetime         not null
#  deleted_user_record_id :bigint(8)        not null
#

class DeletedUserIp < ApplicationRecord
  include InetContainer

  belongs_to :deleted_user_record, inverse_of: :ips

  scope :by_latest_used, -> { order(used_at: :desc) }
end
