# frozen_string_literal: true

module Mastodon
  module DmChat
    module_function

    def enabled?
      ENV['DM_CHAT_ENABLED'] == 'true'
    end
  end
end
