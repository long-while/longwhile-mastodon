# frozen_string_literal: true

# == Schema Information
#
# Table name: deleted_user_records
#
#  id                    :bigint(8)        not null, primary key
#  confirmed_at          :datetime
#  current_sign_in_at    :datetime
#  email                 :string           default(""), not null
#  locale                :string
#  sign_up_ip            :inet
#  created_at            :datetime         not null
#  updated_at            :datetime         not null
#  account_id            :bigint(8)        not null
#  invited_by_account_id :bigint(8)
#

class DeletedUserRecord < ApplicationRecord
  RETENTION_PERIOD = 6.months

  belongs_to :account
  belongs_to :invited_by_account, class_name: 'Account', optional: true

  has_many :ips, class_name: 'DeletedUserIp', inverse_of: :deleted_user_record, dependent: :delete_all

  scope :expired, -> { where(created_at: ...RETENTION_PERIOD.ago) }
  scope :matches_email, ->(value) { where(arel_table[:email].matches("#{value}%")) }
  scope :matches_ip, ->(value) { where(id: DeletedUserIp.contained_by(value).select(:deleted_user_record_id)) }

  def self.capture!(user)
    record = find_or_initialize_by(account_id: user.account_id)
    record.assign_attributes(attributes_from(user))
    record.ips = UserIp.where(user_id: user.id).map { |user_ip| DeletedUserIp.new(ip: user_ip.ip, used_at: user_ip.used_at) }
    record.save!
    record
  end

  def self.attributes_from(user)
    {
      email: user.email.to_s,
      locale: user.locale,
      confirmed_at: user.confirmed_at,
      current_sign_in_at: user.current_sign_in_at,
      sign_up_ip: user.sign_up_ip,
      invited_by_account_id: user.invite&.user&.account_id,
      created_at: Time.current,
    }
  end
  private_class_method :attributes_from

  def email_domain
    email.split('@', 2).last.presence
  end

  def confirmed?
    confirmed_at.present?
  end

  def expires_at
    created_at + RETENTION_PERIOD
  end
end
