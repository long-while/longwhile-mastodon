# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'OCR', :attachment_processing, :inline_jobs, :js, :streaming do
  include ProfileStories

  let(:email)               { 'test@example.com' }
  let(:password)            { 'password' }
  let(:confirmed_at)        { Time.zone.now }
  let(:finished_onboarding) { true }

  before do
    as_a_logged_in_user
    visit root_path
  end

  it 'can recognize text in a media attachment' do
    expect(page).to have_css('div.app-holder')

    within('.compose-form') do
      attach_file('file-upload-input', file_fixture('text.png'), make_visible: true)

      within('.compose-form__upload') do
        click_on(frontend_translations('upload_form.edit')) # 화면은 한국어 고정
      end
    end

    click_on(frontend_translations('alt_text_modal.add_text_from_image'))

    expect(page).to have_css('#description', text: /Hello Mastodon\s*/, wait: 20)
  end
end
