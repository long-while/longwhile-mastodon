# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Home and public tabs', :inline_jobs, :js, :streaming do
  let(:password) { 'longwhile-password' }
  let(:user)     { Fabricate(:user, password: password, account: Fabricate(:account, username: 'alice')) }
  let(:followed) { Fabricate(:user, account: Fabricate(:account, username: 'followed')).account }
  let(:stranger) { Fabricate(:user, account: Fabricate(:account, username: 'stranger')).account }

  before do
    Web::Setting.where(user: user).first_or_initialize(user: user).update!(data: { introductionVersion: 2018_12_16_044202 })
    user.account.follow!(followed)
    PostStatusService.new.call(followed, text: 'from-followed-author')
    PostStatusService.new.call(stranger, text: 'from-a-stranger')
  end

  it 'signs in, shows the home tab, then switches to the public tab' do
    visit new_user_session_path
    fill_in 'user_email', with: user.email
    fill_in 'user_password', with: password
    within('.actions') { click_button }

    expect(page).to have_css('.app-holder')
    visit '/home'

    expect(page).to have_css('.column-header__tab.active[href="/home"]')
    expect(page).to have_css('.status__content', text: 'from-followed-author')
    expect(page).to have_no_css('.status__content', text: 'from-a-stranger')

    find('.column-header__tab[href="/public"]').click

    expect(page).to have_current_path('/public')
    expect(page).to have_css('.column-header__tab.active[href="/public"]')
    expect(page).to have_css('.status__content', text: 'from-followed-author')
    expect(page).to have_no_css('.status__content', text: 'from-a-stranger')
  end
end
