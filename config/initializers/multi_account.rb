# frozen_string_literal: true

# Multi-account switcher configuration
raw_settings =
  if Rails.application.respond_to?(:config_for)
    Rails.application.config_for(:settings)
  else
    {}
  end

default_settings = { 'retain_tokens' => false, 'refresh_flow' => false }

multi_account_settings =
  case raw_settings
  when Hash
    default_settings.merge(raw_settings.fetch('multi_account', {}))
  else
    default_settings.dup
  end

config_from_env = {
  'client_id' => ENV['MA_MULTI_ACCOUNT_CLIENT_ID'],
  'client_secret' => ENV['MA_MULTI_ACCOUNT_CLIENT_SECRET'],
  'redirect_uri' => ENV['MA_MULTI_ACCOUNT_REDIRECT_URI'],
  'retain_tokens' => ENV['MA_MULTI_ACCOUNT_RETAIN_TOKENS'],
  'refresh_flow' => ENV['MA_MULTI_ACCOUNT_REFRESH_FLOW'],
}.compact

merged_config = multi_account_settings.merge(config_from_env)

Rails.configuration.x.multi_account =
  ActiveSupport::HashWithIndifferentAccess.new(merged_config)

boolean_cast = ActiveModel::Type::Boolean.new
Rails.configuration.x.multi_account[:retain_tokens] =
  boolean_cast.cast(Rails.configuration.x.multi_account[:retain_tokens]) || false
Rails.configuration.x.multi_account[:refresh_flow] =
  boolean_cast.cast(Rails.configuration.x.multi_account[:refresh_flow]) || false

raise 'Missing multi-account config: redirect_uri. Please set MA_MULTI_ACCOUNT_REDIRECT_URI environment variable or configure settings.' if Rails.configuration.x.multi_account[:redirect_uri].blank?
