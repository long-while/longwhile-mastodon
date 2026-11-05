# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Localized do
  controller(ApplicationController) do
    include Localized # rubocop:disable RSpec/DescribedClass

    def success
      render plain: I18n.locale, status: 200
    end
  end

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
