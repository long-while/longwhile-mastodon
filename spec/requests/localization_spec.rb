# frozen_string_literal: true

require 'rails_helper'

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
