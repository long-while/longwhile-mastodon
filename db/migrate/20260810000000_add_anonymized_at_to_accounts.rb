# frozen_string_literal: true

class AddAnonymizedAtToAccounts < ActiveRecord::Migration[8.0]
  def change
    add_column :accounts, :anonymized_at, :datetime
  end
end
