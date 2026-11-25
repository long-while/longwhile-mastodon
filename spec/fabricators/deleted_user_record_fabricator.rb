# frozen_string_literal: true

Fabricator(:deleted_user_record) do
  account { Fabricate.build(:account, user: nil) }
  email { sequence(:deleted_email) { |i| "#{i}#{Faker::Internet.email}" } }
  locale 'ko'
  confirmed_at { 1.month.ago }
  sign_up_ip { Faker::Internet.ip_v4_address }
end
