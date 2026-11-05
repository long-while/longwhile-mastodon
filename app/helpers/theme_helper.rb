# frozen_string_literal: true

module ThemeHelper
  # @_longwhile — 테마는 가상 이름(`themes/<이름>`)이 아니라 manifest 의 실제 키
  #   (`config/themes.yml` 의 경로)로 찾는다. 가상 이름은 vite_ruby 전용
  #   manifest-lookup.json 으로만 풀린다. 상류 4.7 의 Vite 연동은 manifest 의
  #   `name` 으로 푸는데, 이 포크 빌드의 CSS 엔트리에는 `name` 이 없다. 실제 키는
  #   지금(vite_ruby)과 4.7 모두에서 같은 파일을 가리킨다.
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

  # @_longwhile — 관리자가 올린 워드마크를 테마에 넘긴다. 테마 SCSS 는
  # `var(--lw-wordmark-*, <번들 그림>)` 으로 읽으므로, 올린 것이 없으면 아무것도
  # 내지 않고 번들 그림이 그대로 쓰인다. 재빌드 없이 바뀌는 길은 이것뿐이다.
  def custom_wordmark_tag
    declarations = SiteUpload::WORDMARK_VARS.filter_map do |var|
      upload = InstancePresenter.new.public_send(var)
      next if upload.blank?

      "--lw-#{var.dasherize}:url(\"#{css_string_escape(upload.file.url)}\");"
    end
    return if declarations.empty?

    tag.style(":root{#{declarations.join}}".html_safe) # rubocop:disable Rails/OutputSafety
  end

  # 4.6 은 current_theme 을 ApplicationController 에서 이 헬퍼로 옮겼다(상류 그대로).
  # 테마 체계(R3)는 포크 것이라 레이아웃은 이 값으로 bird-ui 테마를 고른다.
  def current_theme
    available_themes = Themes.instance.names

    user_theme = current_user&.setting_theme
    return user_theme if user_theme && available_themes.include?(user_theme)

    site_theme = Setting.theme
    return site_theme if available_themes.include?(site_theme)

    'default' # Fallback
  end

  # 상류 4.6 의 색 구성·대비 설정. 고정 프런트와 포크 레이아웃은 쓰지 않지만, 상류
  # 헬퍼(ApplicationHelper#html_attributes)가 부르므로 정의는 둔다.
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

  # URL 에 쓰는 글자만 그대로 두고 나머지는 CSS 이스케이프한다 — `"` · `\` · `<` 가
  # 섞여 있어도 문자열이나 <style> 밖으로 나가지 못한다.
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
