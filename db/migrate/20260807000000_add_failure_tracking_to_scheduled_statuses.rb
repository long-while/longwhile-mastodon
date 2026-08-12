# frozen_string_literal: true

class AddFailureTrackingToScheduledStatuses < ActiveRecord::Migration[8.0]
  def change
    add_column :scheduled_statuses, :publishing_at, :datetime
    add_column :scheduled_statuses, :failed_at, :datetime
    add_column :scheduled_statuses, :last_error, :string
  end
end
