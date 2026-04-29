# frozen_string_literal: true

class TextFormatter
  include ActionView::Helpers::TextHelper
  include ERB::Util
  include RoutingHelper

  URL_PREFIX_REGEX = %r{\A(https?://(www\.)?|xmpp:)}

  DEFAULT_REL = %w(nofollow noopener).freeze

  DEFAULT_OPTIONS = {
    multiline: true,
  }.freeze

  # 공지용 키워드 -> 자동 링크 매핑. 본문에 키워드가 포함되면 해당 키워드만
  # 지정된 URL 의 링크(언더라인 + --color-brand-longwhile-links 색상)로 치환된다.
  AUTO_LINK_KEYWORDS = {
    '한참 커미션' => 'https://kre.pe/QTRx',
  }.freeze

  attr_reader :text, :options

  # @param [String] text
  # @param [Hash] options
  # @option options [Boolean] :multiline
  # @option options [Boolean] :with_domains
  # @option options [Boolean] :with_rel_me
  # @option options [Array<Account>] :preloaded_accounts
  def initialize(text, options = {})
    @text    = text
    @options = DEFAULT_OPTIONS.merge(options)
  end

  def entities
    @entities ||= Extractor.extract_entities_with_indices(text, extract_url_without_protocol: false)
  end

  def to_s
    return ''.html_safe if text.blank?

    html = nil
    MastodonOTELTracer.in_span('TextFormatter#to_s extract_and_rewrite') do
      html = rewrite do |entity|
        if entity[:url]
          link_to_url(entity)
        elsif entity[:hashtag]
          link_to_hashtag(entity)
        elsif entity[:screen_name]
          link_to_mention(entity)
        end
      end
    end

    # 멘션/해시태그/링크 처리 후에 마크다운 적용
    html = apply_simple_markdown(html)

    # 키워드 자동 링크는 마크다운 적용 후 (기존 <a> 태그 내부는 건너뜀)
    html = apply_auto_link_keywords(html)

    if multiline?
      MastodonOTELTracer.in_span('TextFormatter#to_s simple_format') do
        html = simple_format(html, {}, { sanitize: false }).delete("\n")
      end
    end

    html.html_safe # rubocop:disable Rails/OutputSafety
  end

  class << self
    include ERB::Util
    include ActionView::Helpers::TagHelper

    def shortened_link(url, rel_me: false)
      url = Addressable::URI.parse(url).to_s
      rel = rel_me ? (DEFAULT_REL + %w(me)) : DEFAULT_REL

      prefix      = url.match(URL_PREFIX_REGEX).to_s
      display_url = url[prefix.length, 30]
      suffix      = url[prefix.length + 30..]
      cutoff      = url[prefix.length..].length > 30

      if suffix && suffix.length == 1 # revert truncation to account for ellipsis
        display_url += suffix
        suffix = nil
        cutoff = false
      end

      tag.a href: url, target: '_blank', rel: rel.join(' '), translate: 'no' do
        tag.span(prefix, class: 'invisible') +
          tag.span(display_url, class: (cutoff ? 'ellipsis' : '')) +
          tag.span(suffix, class: 'invisible')
      end
    rescue Addressable::URI::InvalidURIError, IDN::Idna::IdnaError
      h(url)
    end
  end

  private

  def apply_simple_markdown(html)
    # ***텍스트*** -> <strong><em>텍스트</em></strong> (굵은 기울임꼴)
    html = html.gsub(/\*\*\*([^\*\n<>]+)\*\*\*/, '<strong><em>\1</em></strong>')

    # **텍스트** -> <strong>텍스트</strong> (굵게)
    html = html.gsub(/\*\*([^\*\n<>]+)\*\*/, '<strong>\1</strong>')

    # *텍스트* -> <em>텍스트</em> (기울임, HTML 태그 안은 제외)
    html = html.gsub(/(?<!\*)\*([^\*\n<>]+)\*(?!\*)/, '<em>\1</em>')

    # ~~~텍스트~~~ -> <del>텍스트</del> (취소선)
    html = html.gsub(/~~~([^~\n<>]+)~~~/, '<del>\1</del>')

    # Hair Space로 감싼 텍스트 -> 파란색 (#1d9bf0)
    html = html.gsub(/\u200A([^\u200A\n<>]+)\u200A/, '<span style="color: #1d9bf0;">\1</span>')

    # [color:hex]텍스트[/color] -> 사용자 지정 색상
    html = html.gsub(/\[color:([0-9a-fA-F]{3,8})\](.*?)\[\/color\]/, '<span style="color: #\1;">\2</span>')

    # [bg:hex]텍스트[/bg] -> 사용자 지정 배경색
    html = html.gsub(/\[bg:([0-9a-fA-F]{3,8})\](.*?)\[\/bg\]/, '<span style="background-color: #\1;">\2</span>')

    # [center]텍스트[/center] -> 중앙 정렬
    html = html.gsub(/\[center\](.*?)\[\/center\]\n?/, '<span style="display: block; text-align: center;">\1</span>')

    # [right]텍스트[/right] -> 우측 정렬
    html = html.gsub(/\[right\](.*?)\[\/right\]\n?/, '<span style="display: block; text-align: right;">\1</span>')

    # [left]텍스트[/left] -> 좌측 정렬
    html = html.gsub(/\[left\](.*?)\[\/left\]\n?/, '<span style="display: block; text-align: left;">\1</span>')

    html
  end

  # AUTO_LINK_KEYWORDS 의 각 키워드를 자동 링크로 치환한다.
  # 기존 <a>...</a> 블록 내부에 등장한 경우(URL 표시 텍스트 등)는 중첩 링크를
  # 만들지 않도록 건너뛴다.
  def apply_auto_link_keywords(html)
    return html if html.blank?

    parts = html.split(/(<a\b[^>]*>.*?<\/a>)/m)
    parts.each_with_index do |part, i|
      next if part.start_with?('<a')

      AUTO_LINK_KEYWORDS.each do |keyword, url|
        next unless part.include?(keyword)

        part = part.gsub(keyword, auto_link_html(keyword, url))
      end

      parts[i] = part
    end

    parts.join
  end

  def auto_link_html(keyword, url)
    %(<a href="#{h(url)}" target="_blank" rel="#{DEFAULT_REL.join(' ')}" style="color: var(--color-brand-longwhile-links); text-decoration: underline;">#{h(keyword)}</a>)
  end

  def rewrite
    entities.sort_by! do |entity|
      entity[:indices].first
    end

    result = +''

    last_index = entities.reduce(0) do |index, entity|
      indices = entity[:indices]
      result << h(text[index...indices.first])
      result << yield(entity)
      indices.last
    end

    result << h(text[last_index..])

    result
  end

  def link_to_url(entity)
    MastodonOTELTracer.in_span('TextFormatter#link_to_url') do
      TextFormatter.shortened_link(entity[:url], rel_me: with_rel_me?)
    end
  end

  def link_to_hashtag(entity)
    MastodonOTELTracer.in_span('TextFormatter#link_to_hashtag') do
      hashtag = entity[:hashtag]
      url     = tag_url(hashtag)

      <<~HTML.squish
        <a href="#{h(url)}" class="mention hashtag" rel="tag">#<span>#{h(hashtag)}</span></a>
      HTML
    end
  end

  def link_to_mention(entity)
    MastodonOTELTracer.in_span('TextFormatter#link_to_mention') do
      username, domain = entity[:screen_name].split('@')
      domain           = nil if local_domain?(domain)
      account          = nil

      if preloaded_accounts?
        same_username_hits = 0

        preloaded_accounts.each do |other_account|
          same_username = other_account.username.casecmp(username).zero?
          same_domain   = other_account.domain.nil? ? domain.nil? : other_account.domain.casecmp(domain)&.zero?

          if same_username && !same_domain
            same_username_hits += 1
          elsif same_username && same_domain
            account = other_account
          end
        end
      else
        account = entity_cache.mention(username, domain)
      end

      return "@#{h(entity[:screen_name])}" if account.nil?

      url = ActivityPub::TagManager.instance.url_for(account)
      display_username = same_username_hits&.positive? || with_domains? ? account.pretty_acct : account.username

      <<~HTML.squish
        <span class="h-card" translate="no"><a href="#{h(url)}" class="u-url mention">@<span>#{h(display_username)}</span></a></span>
      HTML
    end
  end

  def entity_cache
    @entity_cache ||= EntityCache.instance
  end

  def tag_manager
    @tag_manager ||= TagManager.instance
  end

  delegate :local_domain?, to: :tag_manager

  def multiline?
    options[:multiline]
  end

  def with_domains?
    options[:with_domains]
  end

  def with_rel_me?
    options[:with_rel_me]
  end

  def preloaded_accounts
    options[:preloaded_accounts]
  end

  def preloaded_accounts?
    preloaded_accounts.present?
  end
end