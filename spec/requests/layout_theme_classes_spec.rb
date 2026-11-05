# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Layout theme classes' do
  let(:user) { Fabricate(:user) }

  before { sign_in(user) }

  it 'renders the 4.5 body classes for the web app' do
    get '/home'

    expect(response).to have_http_status(200)
    expect(response.parsed_body.at_css('body')['class'].split)
      .to eq ['app-body', "theme-#{Setting.theme.parameterize}", 'custom-scrollbars', 'no-reduce-motion']
  end

  it 'reflects the user display settings on the body' do
    user.settings['web.use_system_font'] = true
    user.settings['web.reduce_motion'] = true
    user.save!

    get '/home'

    expect(response.parsed_body.at_css('body')['class'].split)
      .to include('system-font', 'reduce-motion')
      .and not_include('no-reduce-motion')
  end

  it 'puts the upstream attributes on the html element' do
    get '/home'

    html = response.parsed_body.at_css('html')
    expect(html['lang']).to eq 'ko'
    expect(html['data-color-scheme']).to be_present
    expect(html['data-contrast']).to be_present
  end
end
