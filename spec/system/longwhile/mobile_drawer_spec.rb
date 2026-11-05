# frozen_string_literal: true

require 'rails_helper'

# @_longwhile — 모바일(759px 이하) 서랍. 헤더 왼쪽 위의 프로필 사진
#   (MobileMenuAvatarButton)이 열고, 서랍은 body 로 포털돼 하단 막대 위에 뜬다
#   (CLAUDE.md "모바일 서랍"). 레이아웃은 부팅할 때 창 너비로 정해지므로 창을 먼저
#   줄인다.
RSpec.describe 'Mobile drawer', :js, :streaming do
  let(:user) { Fabricate(:user, account: Fabricate(:account, username: 'alice')) }
  let(:original_window_size) { page.current_window.size }

  # 드라이버와 무관한 Capybara 창 API 를 쓴다(Playwright 에서는 뷰포트를 바꾼다).
  # `driven_by` 가 전역 before 에서 정해지므로 around 가 아니라 before 에서 바꾼다.
  # 창 크기는 다음 예제로 이어지므로 원래대로 돌려 둔다.
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

    # 서랍이 하단 막대 밑으로 들어가면 아래쪽(설정·계정 전환)을 누를 수 없다.
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
