# frozen_string_literal: true

# @_longwhile — 환경설정 하위 네임스페이스를 걷어내고 상위 화면 둘(화면·알림)이
# 공유하는 밑바탕으로 남겼다 (settings-phase-5.md §1.1).
class Settings::PreferencesBaseController < Settings::BaseController
  def show; end

  def update
    if current_user.update(user_params)
      I18n.locale = current_user.locale
      redirect_to after_update_redirect_path, notice: I18n.t('generic.changes_saved_msg')
    else
      render :show
    end
  end

  private

  def after_update_redirect_path
    raise 'Override in controller'
  end

  def user_params
    params.expect(user: [:locale, :time_zone, chosen_languages: [], settings_attributes: UserSettings.keys])
  end
end
