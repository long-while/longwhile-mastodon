# frozen_string_literal: true

module MultiAccountConfig
  module_function

  def retain_tokens?
    boolean_cast.cast(Rails.configuration.x.multi_account[:retain_tokens]) || false
  end

  def refresh_flow_enabled?
    boolean_cast.cast(Rails.configuration.x.multi_account[:refresh_flow]) || false
  end

  def boolean_cast
    @boolean_cast ||= ActiveModel::Type::Boolean.new
  end
  private_class_method :boolean_cast
end


