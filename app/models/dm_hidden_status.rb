# frozen_string_literal: true

# == Schema Information
#
# Table name: dm_hidden_statuses
#
#  id         :bigint(8)        not null, primary key
#  created_at :datetime         not null
#  updated_at :datetime         not null
#  account_id :bigint(8)        not null
#  status_id  :bigint(8)        not null
#

# @_longwhile custom feature
class DmHiddenStatus < ApplicationRecord
  belongs_to :account
  belongs_to :status

  scope :status_ids_for, ->(account) { where(account_id: account.id).select(:status_id) }
end
