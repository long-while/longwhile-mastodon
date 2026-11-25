# frozen_string_literal: true

module TextColorPalette
  MAX_COLORS = 12
  NAME_MAX_LENGTH = 12
  HEX_PATTERN = /\A(?:\h{3}|\h{6})\z/

  module_function

  def normalize(raw)
    entries = raw.respond_to?(:values) ? raw.values : Array(raw)

    entries.filter_map do |entry|
      next unless entry.respond_to?(:[])

      name = entry['name'].to_s.strip
      hex = clean_hex(entry['hex'])
      next if name.empty? && hex.empty?

      { 'name' => name, 'hex' => hex }
    end
  end

  def clean_hex(value)
    value.to_s.gsub(/[^0-9a-fA-F]/, '').downcase
  end

  def problems(colors)
    problems = []
    problems << [:too_many, { count: MAX_COLORS }] if colors.size > MAX_COLORS

    colors.each.with_index(1) do |color, position|
      problems << [:blank_name, { position: position }] if color['name'].empty?
      problems << [:long_name, { position: position, count: NAME_MAX_LENGTH }] if color['name'].length > NAME_MAX_LENGTH
      problems << [:invalid_hex, { position: position }] unless HEX_PATTERN.match?(color['hex'])
    end

    problems
  end

  def current
    normalize(Setting.text_color_palette || [])
      .select { |color| color['name'].present? && HEX_PATTERN.match?(color['hex']) }
      .first(MAX_COLORS)
  end
end
