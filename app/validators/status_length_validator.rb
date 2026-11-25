# frozen_string_literal: true

class StatusLengthValidator < ActiveModel::Validator
  DEFAULT_MAX_CHARS = 1000
  MIN_LIMIT = 500
  MAX_LIMIT = 10_000

  MAX_CHARS = DEFAULT_MAX_CHARS
  URL_PLACEHOLDER_CHARS = 23
  URL_PLACEHOLDER = 'x' * 23

  def self.max_chars
    value = Integer(Setting.status_length_limit, exception: false)
    value&.between?(MIN_LIMIT, MAX_LIMIT) ? value : DEFAULT_MAX_CHARS
  end

  def validate(status)
    return unless status.local? && !status.reblog?
    return unless status.new_record? || status.will_save_change_to_text? || status.will_save_change_to_spoiler_text?

    limit = effective_limit(status)
    status.errors.add(:text, I18n.t('statuses.over_character_limit', max: limit)) if length_of(status.spoiler_text, status.text) > limit
  end

  private

  def effective_limit(status)
    candidates = [self.class.max_chars, status.length_limit_override.to_i]
    candidates << length_of(status.spoiler_text_was, status.text_was) if status.persisted?
    candidates.max
  end

  def length_of(spoiler_text, text)
    countable_length([spoiler_text, countable_text(text)].join)
  end

  def countable_length(str)
    str.each_grapheme_cluster.size
  end

  def countable_text(str)
    return '' if str.blank?

    # To ensure that we only give length concessions to entities that
    # will be correctly parsed during formatting, we go through full
    # entity extraction

    entities = Extractor.remove_overlapping_entities(Extractor.extract_urls_with_indices(str, extract_url_without_protocol: false) + Extractor.extract_mentions_or_lists_with_indices(str))

    rewrite_entities(str, entities) do |entity|
      if entity[:url]
        URL_PLACEHOLDER
      elsif entity[:screen_name]
        "@#{entity[:screen_name].split('@').first}"
      end
    end
  end

  def rewrite_entities(str, entities)
    entities.sort_by! { |entity| entity[:indices].first }
    result = +''

    last_index = entities.reduce(0) do |index, entity|
      result << str[index...entity[:indices].first]
      result << yield(entity)
      entity[:indices].last
    end

    result << str[last_index..]
    result
  end
end
