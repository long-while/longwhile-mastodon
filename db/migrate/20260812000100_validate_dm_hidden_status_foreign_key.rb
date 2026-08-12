# frozen_string_literal: true

# @_longwhile custom feature
class ValidateDmHiddenStatusForeignKey < ActiveRecord::Migration[8.0]
  def change
    validate_foreign_key :dm_hidden_statuses, :statuses, column: :status_id
  end
end
