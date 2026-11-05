# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Share page', :js, :streaming do
  include ProfileStories

  let(:email)               { 'test@example.com' }
  let(:password)            { 'password' }
  let(:confirmed_at)        { Time.zone.now }
  let(:finished_onboarding) { true }

  before { as_a_logged_in_user }

  it 'allows posting a new status' do
    visit share_path

    expect(page)
      .to have_css('.modal-layout__mastodon')
      .and have_css('div#mastodon-compose')
      .and have_css('.compose-form__submit')
    expect(find_by_id('mastodon-compose')['data-props'])
      .to eq('{"locale":"ko"}') # 화면은 한국어 고정

    fill_in_form

    # 업스트림은 게시 뒤 그 글로 이동한다(#35763, 프론트 변경). 이 포크의 프론트는 그 전
    # 것으로 고정이라 알림 막대만 띄운다.
    expect(page)
      .to have_css('.notification-bar-message', text: frontend_translations('compose.published.body'))
  end

  def fill_in_form
    within('.compose-form') do
      fill_in frontend_translations('compose_form.placeholder'),
              with: 'This is a new status!'
      click_on frontend_translations('compose_form.publish')
    end
  end
end
