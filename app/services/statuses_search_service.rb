# frozen_string_literal: true

class StatusesSearchService < BaseService
  include SearchStoplight

  ES_QUERY_TIMEOUT = ENV.fetch('ES_QUERY_TIMEOUT', '10s')

  def call(query, account = nil, options = {})
    MastodonOTELTracer.in_span('StatusesSearchService#call') do |span|
      @query   = query&.strip
      @account = account
      @options = options
      @limit   = options[:limit].to_i
      @offset  = options[:offset].to_i
      convert_deprecated_options!

      span.add_attributes(
        'search.offset' => @offset,
        'search.limit' => @limit,
        'search.backend' => Chewy.enabled? ? 'elasticsearch' : 'database',
        'search.query_language' => detect_query_language(@query),
        'search.query_type' => detect_query_type(@query)
      )

      status_search_results.tap do |results|
        span.set_attribute('search.results.count', results.size)
      end
    end
  end

  private

  def status_search_results
    return [] if @query.blank?

    request = build_optimized_search_request
    results = elastic_stoplight_wrapper.run do
      request.timeout(ES_QUERY_TIMEOUT)
        .collapse(field: :id)
        .order(build_sort_criteria)
        .limit(@limit)
        .offset(@offset)
        .objects
        .compact
    end

    account_ids         = results.map(&:account_id)
    account_domains     = results.map(&:account_domain)

    @account.preload_relations!(account_ids, account_domains)

    results.reject { |status| StatusFilter.new(status, @account).filtered? }
  rescue Stoplight::Error::RedLight, Faraday::ConnectionFailed, Parslet::ParseFailed, Errno::ENETUNREACH, OpenSSL::SSL::SSLError, Elastic::Transport::Transport::Error => e
    Rails.logger.warn "Search failed: #{e.message}"
    []
  end

  def build_optimized_search_request
    base_request = parsed_query.request

    if contains_korean?(@query)
      add_korean_optimized_query(base_request)
    elsif contains_only_english?(@query)
      add_english_optimized_query(base_request)
    else
      add_multilingual_query(base_request)
    end
  end

  def add_korean_optimized_query(base_request)
    base_request.query(
      bool: {
        should: [
          base_request.render[:body][:query],
          
          {
            multi_match: {
              query: clean_query,
              fields: [
                'text.korean^3.0',
                'text.content^2.5',
                'text.personal^2.0',
                'text.social^1.5',
                'account_display_name^1.2',
              ],
              type: 'most_fields',
              minimum_should_match: '70%'
            }
          },

          {
            match: {
              tags: {
                query: clean_query.gsub('#', ''),
                boost: 2.0
              }
            }
          }
        ],
        minimum_should_match: 1
      }
    )
  end

  def add_english_optimized_query(base_request)
    base_request.query(
      bool: {
        should: [
          base_request.render[:body][:query],
          {
            multi_match: {
              query: clean_query,
              fields: [
                'text.english^3.0',
                'text.content^2.0',
                'text^1.0'
              ],
              type: 'best_fields',
              tie_breaker: 0.3
            }
          }
        ],
        minimum_should_match: 1
      }
    )
  end

  def add_multilingual_query(base_request)
    base_request.query(
      bool: {
        should: [
          base_request.render[:body][:query],
          {
            multi_match: {
              query: clean_query,
              fields: [
                'text.content^2.5',
                'text.korean^2.0',
                'text.english^2.0',
                'text.social^1.5',
                'text^1.0'
              ],
              type: 'most_fields',
              minimum_should_match: '60%'
            }
          }
        ]
      }
    )
  end

  def build_sort_criteria
    base_sort = { id: { order: :desc } }
    
    if contains_korean?(@query)
      {
        _score: { order: :desc },
        favourites_count: { order: :desc, missing: 0 },
        created_at: { order: :desc }
      }
    else
      base_sort
    end
  end

  def parsed_query
    SearchQueryTransformer.new.apply(SearchQueryParser.new.parse(@query), current_account: @account)
  end

  def convert_deprecated_options!
    syntax_options = []

    if @options[:account_id]
      username = Account.select(:username, :domain).find(@options[:account_id]).acct
      syntax_options << "from:@#{username}"
    end

    if @options[:min_id]
      timestamp = Mastodon::Snowflake.to_time(@options[:min_id].to_i)
      syntax_options << "after:\"#{timestamp.iso8601}\""
    end

    if @options[:max_id]
      timestamp = Mastodon::Snowflake.to_time(@options[:max_id].to_i)
      syntax_options << "before:\"#{timestamp.iso8601}\""
    end

    @query = "#{@query} #{syntax_options.join(' ')}".strip if syntax_options.any?
  end

  def contains_korean?(text)
    return false if text.blank?
    !!(text =~ /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/)
  end

  def contains_only_english?(text)
    return false if text.blank?
    !!(text =~ /\A[a-zA-Z0-9\s\-_@#.!?]+\z/)
  end

  def clean_query
    return '' if @query.blank?
    
    @query.gsub(/[^\w가-힣\s#@]/, ' ')
          .squeeze(' ')
          .strip
  end

  def detect_query_language(query)
    return 'unknown' if query.blank?

    if contains_korean?(query)
      contains_only_english?(query) ? 'mixed' : 'korean'
    elsif contains_only_english?(query)
      'english'
    else
      'mixed'
    end
  end

  def detect_query_type(query)
    return 'empty' if query.blank?

    case query
    when /^@\w+/
      'mention'
    when /^#\w+/
      'hashtag'
    when /^https?:\/\//
      'url'
    when /^\d+$/
      'numeric'
    when /[가-힣]/
      'korean_text'
    when /^[a-zA-Z\s]+$/
      'english_text'
    else
      'mixed_text'
    end
  end
end