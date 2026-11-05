# frozen_string_literal: true

require 'rails_helper'

# 이 인스턴스는 화면 언어를 한국어로 고정한다(Localized#requested_locale 이 항상 :ko).
# 업스트림은 Accept-Language 로 언어를 골랐다. 여기서는 어떤 헤더가 와도 한국어로
# 나오는지, 그리고 요청한 언어로 바뀌지 않는지를 본다.
RSpec.describe 'Localization' do
  around do |example|
    I18n.with_locale(I18n.locale) do
      example.run
    end
  end

  it 'ignores a specific region and renders Korean' do
    headers = { 'Accept-Language' => 'zh-HK' }

    get '/auth/sign_in', headers: headers

    expect(response.body)
      .to include(I18n.t('auth.login', locale: :ko))
      .and not_include(I18n.t('auth.login', locale: 'zh-HK'))
  end

  it 'ignores a language with a missing region and renders Korean' do
    headers = { 'Accept-Language' => 'es-FAKE' }

    get '/auth/sign_in', headers: headers

    expect(response.body)
      .to include(I18n.t('auth.login', locale: :ko))
      .and not_include(I18n.t('auth.login', locale: 'es'))
  end

  it 'renders Korean when the locale is missing' do
    headers = { 'Accept-Language' => '12-FAKE' }

    get '/auth/sign_in', headers: headers

    expect(response.body).to include(I18n.t('auth.login', locale: :ko))
  end
end
