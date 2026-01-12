# frozen_string_literal: true

class ResetAdvancedLayoutSetting < ActiveRecord::Migration[7.2]
  disable_ddl_transaction!

  def up
    say_with_time 'Removing advanced layout setting for all users' do
      safety_assured do
        execute <<~SQL.squish
          UPDATE users
          SET settings = (COALESCE(settings::jsonb, '{}'::jsonb)) #- '{web,advanced_layout}'
          WHERE settings::jsonb #>> '{web,advanced_layout}' IS NOT NULL
        SQL
      end
    end
  end

  def down
    raise ActiveRecord::IrreversibleMigration
  end
end

