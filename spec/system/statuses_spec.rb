# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Status page' do
  let(:status) { Fabricate :status }

  it 'visits the status page and renders the web app' do
    visit short_account_status_path(account_username: status.account.username, id: status.id)

    expect(page)
      .to have_css('noscript', text: /마스토돈/) # 화면은 한국어 고정(Localized#requested_locale)
      .and have_css('body', class: 'app-body')
  end
end
