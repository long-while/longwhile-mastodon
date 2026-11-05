# frozen_string_literal: true

class CopyReservedUsernamesToUsernameBlocks < ActiveRecord::Migration[8.0]
  class Setting < ApplicationRecord; end
  class UsernameBlock < ApplicationRecord; end

  HOMOGLYPHS = {
    '1' => 'i',
    '2' => 'z',
    '3' => 'e',
    '4' => 'a',
    '5' => 's',
    '7' => 't',
    '8' => 'b',
    '9' => 'g',
    '0' => 'o',
  }.freeze

  def up
    Setting.reset_column_information
    UsernameBlock.reset_column_information

    names = missing_names(reserved_usernames)
    return if names.empty?

    now = Time.now.utc
    UsernameBlock.insert_all(
      names.map do |name|
        { username: name, normalized_username: normalize(name), exact: true, allow_with_approval: false, created_at: now, updated_at: now }
      end
    )
  end

  def down; end

  private

  def reserved_usernames
    raw = Setting.find_by(var: 'reserved_usernames')&.attributes&.fetch('value', nil)
    return [] if raw.blank?

    value = YAML.safe_load(raw, permitted_classes: [ActiveSupport::HashWithIndifferentAccess, Symbol])
    names = value.is_a?(String) ? value.split(/[\s,]+/) : Array(value)
    names.map { |name| name.to_s.strip }.compact_blank
  end

  def missing_names(names)
    existing = UsernameBlock.pluck(Arel.sql('lower(username)')).to_set
    names.uniq(&:downcase).reject { |name| existing.include?(name.downcase) }
  end

  def normalize(name)
    name.downcase.gsub(Regexp.union(HOMOGLYPHS.keys), HOMOGLYPHS)
  end
end
