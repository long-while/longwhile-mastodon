# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Mobile drawer', :js, :streaming do
  let(:user) { Fabricate(:user, account: Fabricate(:account, username: 'alice')) }
  let(:original_window_size) { page.current_window.size }

  before do
    Web::Setting.where(user: user).first_or_initialize(user: user).update!(data: { introductionVersion: 2018_12_16_044202 })
    sign_in user
    original_window_size
    page.current_window.resize_to(375, 812)
  end

  after { page.current_window.resize_to(*original_window_size) }

  it 'opens the drawer above the bottom bar from the avatar button, and closes it' do
    visit '/home'

    expect(page).to have_css('.ui__navigation-bar')
    expect(page).to have_no_css('.navigation-panel__container--overlay')
    expect(top_element_at_bottom_left_inside?('.ui__navigation-bar')).to be true

    find('.column-header__avatar-menu').click

    expect(page).to have_css('body > .navigation-panel__container--overlay .navigation-panel__wrapper--open .navigation-panel')
    expect(page).to have_css('.column-header__avatar-menu[aria-expanded="true"]')

    expect(top_element_at_bottom_left_inside?('.navigation-panel__container')).to be true

    find('.navigation-panel__wrapper--open').send_keys(:escape)

    expect(page).to have_no_css('.navigation-panel__container--overlay')
  end

  def top_element_at_bottom_left_inside?(selector)
    page.evaluate_script(<<~JS)
      document.elementFromPoint(20, window.innerHeight - 10).closest(#{selector.to_json}) !== null
    JS
  end
end
