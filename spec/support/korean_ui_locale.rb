# frozen_string_literal: true

Faker::Config.locale = :en

RSpec.configure do |config|
  %i(controller system).each do |type|
    config.around(:each, type: type) do |example|
      I18n.with_locale(:ko) { example.run }
    end
  end
end
