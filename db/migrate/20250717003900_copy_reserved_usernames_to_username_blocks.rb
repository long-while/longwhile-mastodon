# frozen_string_literal: true

# @_longwhile — 운영자가 더한 예약 아이디 옮기기
#   4.5 부터 UnreservedUsernameValidator 는 Setting.reserved_usernames 를 읽지 않고
#   username_blocks 만 본다. 그런데 CreateUsernameBlocks 는 업스트림 기본 목록만 넣으므로,
#   운영자가 설정에 더한 이름은 배포하는 순간 가입할 수 있게 된다. 설정의 이름을 그대로
#   옮긴다. 이미 있는 이름(대소문자 무시)은 건너뛰어 다시 돌려도 된다.
#
#   설정 행은 지우지 않는다 — 배포 후 마이그레이션 전에 4.4 로 되돌려도 예약이 살아 있어야 한다.
class CopyReservedUsernamesToUsernameBlocks < ActiveRecord::Migration[8.0]
  class Setting < ApplicationRecord; end
  class UsernameBlock < ApplicationRecord; end

  # UsernameBlock::HOMOGLYPHS 와 같다. 마이그레이션이 모델 코드에 기대지 않도록 옮겨 둔다.
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
