# frozen_string_literal: true

RSpec.configure do |config|
  config.around(:each, :utc_time_zone) do |example|
    Time.use_zone('UTC') { example.run }
  end
end
