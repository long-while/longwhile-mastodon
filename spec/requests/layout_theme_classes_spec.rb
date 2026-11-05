# frozen_string_literal: true

require 'rails_helper'

# @_longwhile — 4.6 은 테마·글꼴·스크롤바·모션·rtl 클래스를 <body> 에서 <html> 로 옮기고
# 테마 클래스(theme-*)는 아예 없앴다. 고정 프런트와 bird-ui·theme-ui 테마는 그 클래스를
# <body> 에서 찾으므로(body.theme-mastodon-bird-ui-light 등), 빠지면 라이트 테마가 통째로
# 깨진다. 4.5 에서 렌더되던 <body> 클래스가 그대로 나와야 한다.
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
    expect(html['lang']).to eq 'ko' # 화면은 한국어 고정(Localized#requested_locale)
    expect(html['data-color-scheme']).to be_present
    expect(html['data-contrast']).to be_present
  end
end
