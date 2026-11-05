# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Home page' do
  context 'when signed in' do
    before { sign_in Fabricate(:user) }

    it 'visits the homepage and renders the web app' do
      visit root_path

      expect(page)
        .to have_css('noscript', text: /마스토돈/) # 화면은 한국어 고정(Localized#requested_locale)
        .and have_css('body', class: 'app-body')
      expect(find('.app-holder#mastodon')['data-props'])
        .to eq('{"locale":"ko"}') # 화면은 한국어 고정
    end
  end

  context 'when not signed in' do
    it 'visits the homepage and renders the web app' do
      visit root_path

      expect(page)
        .to have_css('noscript', text: /마스토돈/) # 화면은 한국어 고정(Localized#requested_locale)
        .and have_css('body', class: 'app-body')
    end

    context 'when the landing page is set to about' do
      before do
        Setting.landing_page = 'about'
      end

      it 'visits the root path and is redirected to the about page', :js do
        visit root_path

        expect(page).to have_current_path('/about')
      end
    end

    context 'when the landing page is set to trends' do
      before do
        Setting.landing_page = 'trends'
      end

      it 'visits the root path and is redirected to the trends page', :js do
        visit root_path

        expect(page).to have_current_path('/explore')
      end
    end

    context 'when the landing page is set to local_feed' do
      before do
        Setting.landing_page = 'local_feed'
      end

      # 이 포크의 웹 앱(4.4 고정)은 비로그인 첫 화면을 trends_as_landing_page 하나로만 고른다
      # (InitialStateSerializer 가 landing_page == 'trends' 로 계산). local_feed 는 about 으로 간다.
      it 'visits the root path and is redirected to the about page', :js do
        visit root_path

        expect(page).to have_current_path('/about')
      end
    end
  end
end
