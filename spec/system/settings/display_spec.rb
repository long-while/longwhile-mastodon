# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Settings display page' do
  let(:user) { Fabricate :user }

  before { sign_in user }

  it 'Views and updates user prefs' do
    visit settings_display_path

    expect(page)
      .to have_private_cache_control

    # 이 포크의 config/themes.yml 에는 contrast 가 없다. 포크의 테마로 본다.
    select I18n.t('themes.mastodon-bird-ui-dark'), from: theme_selection_field
    uncheck confirm_delete_field

    expect { save_changes }
      .to change { user.reload.settings.theme }.to('mastodon-bird-ui-dark')
      .and change { user.reload.settings['web.delete_modal'] }.to(false)
    expect(page)
      .to have_title(I18n.t('settings.preferences'))
  end

  def save_changes
    # 저장 단추는 폼 밖, 제목 옆에 있다(form="edit_user"). settings/display/show 참고.
    click_on submit_button
  end

  def confirm_delete_field
    form_label('defaults.setting_delete_modal')
  end

  def theme_selection_field
    form_label('defaults.setting_theme')
  end
end
