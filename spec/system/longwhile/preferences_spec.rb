# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Preferences', :js, :streaming do
  let(:user) { Fabricate(:user) }

  before { sign_in user }

  it 'changes the theme from the display screen' do
    visit '/settings/display'

    find_by_id('user_settings_attributes_theme').find("option[value='mastodon-bird-ui-dark']").select_option
    find('button[form="edit_user"]').click

    expect(page).to have_current_path('/settings/display')
    expect(page).to have_css('.flash-message')
    expect(user.reload.settings['theme']).to eq 'mastodon-bird-ui-dark'
    expect(page).to have_css('link[href*="mastodon-bird-ui-dark"]', visible: :all)
  end
end
