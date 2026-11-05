# frozen_string_literal: true

module ThemeHelper
  def theme_style_tags(theme)
    if theme == 'system'
      ''.html_safe.tap do |tags|
        tags << vite_stylesheet_tag(Themes.instance.path_for('mastodon-light'), media: 'not all and (prefers-color-scheme: dark)', crossorigin: 'anonymous')
        tags << vite_stylesheet_tag(Themes.instance.path_for('default'), media: '(prefers-color-scheme: dark)', crossorigin: 'anonymous')
      end
    else
      vite_stylesheet_tag Themes.instance.path_for(theme), media: 'all', crossorigin: 'anonymous'
    end
  end

  def theme_color_tags(theme)
    if theme == 'system'
      ''.html_safe.tap do |tags|
        tags << tag.meta(name: 'theme-color', content: Themes::THEME_COLORS[:dark], media: '(prefers-color-scheme: dark)')
        tags << tag.meta(name: 'theme-color', content: Themes::THEME_COLORS[:light], media: '(prefers-color-scheme: light)')
      end
    else
      tag.meta name: 'theme-color', content: theme_color_for(theme)
    end
  end

  def custom_stylesheet
    return if active_custom_stylesheet.blank?

    stylesheet_link_tag(
      custom_css_path(active_custom_stylesheet),
      host: root_url,
      media: :all,
      skip_pipeline: true
    )
  end

  def custom_wordmark_tag
    declarations = SiteUpload::WORDMARK_VARS.filter_map do |var|
      upload = InstancePresenter.new.public_send(var)
      next if upload.blank?

      "--lw-#{var.dasherize}:url(\"#{css_string_escape(upload.file.url)}\");"
    end
    return if declarations.empty?

    tag.style(":root{#{declarations.join}}".html_safe) # rubocop:disable Rails/OutputSafety
  end

  def current_theme
    available_themes = Themes.instance.names

    user_theme = current_user&.setting_theme
    return user_theme if user_theme && available_themes.include?(user_theme)

    site_theme = Setting.theme
    return site_theme if available_themes.include?(site_theme)

    'default' # Fallback
  end

  def color_scheme
    current_user&.setting_color_scheme || 'auto'
  end

  def contrast
    current_user&.setting_contrast || 'auto'
  end

  def page_color_scheme
    content_for(:force_color_scheme).presence || color_scheme
  end

  private

  def css_string_escape(value)
    value.to_s.gsub(%r{[^A-Za-z0-9\-._~:/?@!$&'()*+,;=%\[\]#]}) { |char| "\\#{char.ord.to_s(16)} " }
  end

  def active_custom_stylesheet
    return if cached_custom_css_digest.blank?

    [:custom, cached_custom_css_digest.to_s.first(8)]
      .compact_blank
      .join('-')
  end

  def cached_custom_css_digest
    Rails.cache.fetch(:setting_digest_custom_css) do
      Setting.custom_css&.then { |content| Digest::SHA256.hexdigest(content) }
    end
  end

  def theme_color_for(theme)
    theme == 'mastodon-light' ? Themes::THEME_COLORS[:light] : Themes::THEME_COLORS[:dark]
  end
end
