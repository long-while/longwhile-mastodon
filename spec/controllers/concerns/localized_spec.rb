# frozen_string_literal: true

require 'rails_helper'

# 이 포크는 브라우저 언어나 사용자 설정과 무관하게 언제나 한국어다
# (`Localized#requested_locale`). 업스트림의 경우마다 같은 입력을 주고 `ko` 를 기대한다.
RSpec.describe Localized do
  controller(ApplicationController) do
    include Localized # rubocop:disable RSpec/DescribedClass

    def success
      render plain: I18n.locale, status: 200
    end
  end

  # spec/support/korean_ui_locale.rb 가 깔아 둔 :ko 를 걷는다. 그대로 두면 이
  # 컨선이 로캘을 정하지 않아도 `ko` 가 나와 통과해 버린다.
  around do |example|
    I18n.with_locale(:en) { example.run }
  end

  before do
    routes.draw { get 'success' => 'anonymous#success' }
  end

  shared_examples 'default locale' do
    it 'ignores an available and preferred language' do
      request.headers['Accept-Language'] = 'sr-Latn'
      get 'success'
      expect(response.body).to eq 'ko'
    end

    it 'ignores an available and preferred language among several' do
      request.headers['Accept-Language'] = 'ca-ES, fa'
      get 'success'
      expect(response.body).to eq 'ko'
    end

    it 'ignores an available and compatible language if none of available languages are preferred' do
      request.headers['Accept-Language'] = 'fa-IR'
      get 'success'
      expect(response.body).to eq 'ko'
    end

    it 'uses Korean rather than the default locale if none of available languages are compatible' do
      request.headers['Accept-Language'] = ''
      get 'success'
      expect(response.body).to eq 'ko'
    end
  end

  context 'with a user with valid locale has signed in' do
    it "ignores user's locale" do
      user = Fabricate(:user, locale: :ca)

      sign_in(user)
      get 'success'

      expect(response.body).to eq 'ko'
    end
  end

  context 'with a user with invalid locale has signed in' do
    before do
      user = Fabricate.build(:user, locale: :invalid)
      user.save!(validate: false)
      sign_in(user)
    end

    it_behaves_like 'default locale'
  end

  context 'with a user who has not signed in' do
    it_behaves_like 'default locale'
  end
end
