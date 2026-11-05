# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Privacy policy page' do
  it 'visits the privacy policy page and renders the web app' do
    visit privacy_policy_path

    expect(page)
      .to have_css('noscript', text: /마스토돈/) # 화면은 한국어 고정(Localized#requested_locale)
      .and have_css('body', class: 'app-body')
  end
end
