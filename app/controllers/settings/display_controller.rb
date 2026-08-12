# frozen_string_literal: true

class Settings::DisplayController < Settings::PreferencesBaseController
  private

  def after_update_redirect_path
    settings_display_path
  end
end
