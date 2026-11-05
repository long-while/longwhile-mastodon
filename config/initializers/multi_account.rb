# frozen_string_literal: true

# Multi-account switcher configuration
raw_settings =
  if Rails.application.respond_to?(:config_for)
    Rails.application.config_for(:settings)
  else
    {}
  end

default_settings = { 'retain_tokens' => true, 'refresh_flow' => true }

multi_account_settings =
  case raw_settings
  when Hash
    ma_config = raw_settings.fetch('multi_account', nil) ||
                raw_settings.fetch(:multi_account, nil) ||
                {}
    ma_config = ma_config.to_h if ma_config.respond_to?(:to_h) && !ma_config.is_a?(Hash)
    default_settings.merge(ma_config.transform_keys(&:to_s))
  else
    default_settings.dup
  end

config_from_env = {
  'client_id' => ENV['MA_MULTI_ACCOUNT_CLIENT_ID'],
  'client_secret' => ENV['MA_MULTI_ACCOUNT_CLIENT_SECRET'],
  'redirect_uri' => ENV['MA_MULTI_ACCOUNT_REDIRECT_URI'],
  'retain_tokens' => ENV['MA_MULTI_ACCOUNT_RETAIN_TOKENS'],
  'refresh_flow' => ENV['MA_MULTI_ACCOUNT_REFRESH_FLOW'],
}.reject { |_k, v| v.nil? || v.to_s.strip.empty? }

merged_config = multi_account_settings.merge(config_from_env)

Rails.configuration.x.multi_account =
  ActiveSupport::HashWithIndifferentAccess.new(merged_config)

boolean_cast = ActiveModel::Type::Boolean.new
retain_raw = Rails.configuration.x.multi_account[:retain_tokens]
retain_val = (retain_raw.is_a?(String) && retain_raw.strip.empty?) ? nil : boolean_cast.cast(retain_raw)
Rails.configuration.x.multi_account[:retain_tokens] = retain_val.nil? ? true : retain_val
refresh_raw = Rails.configuration.x.multi_account[:refresh_flow]
refresh_val = (refresh_raw.is_a?(String) && refresh_raw.strip.empty?) ? nil : boolean_cast.cast(refresh_raw)
Rails.configuration.x.multi_account[:refresh_flow] = refresh_val.nil? ? true : refresh_val

raise 'Missing multi-account config: redirect_uri. Please set MA_MULTI_ACCOUNT_REDIRECT_URI environment variable or configure settings.' if Rails.configuration.x.multi_account[:redirect_uri].blank?
