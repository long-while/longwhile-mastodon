# frozen_string_literal: true

class StatusesSearchService < BaseService
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
    results = request.collapse(field: :id)
                     .order(build_sort_criteria)
                     .limit(@limit)
                     .offset(@offset)
                     .objects
                     .compact

    account_ids         = results.map(&:account_id)
    account_domains     = results.map(&:account_domain)
    preloaded_relations = @account.relations_map(account_ids, account_domains)

    results.reject { |status| StatusFilter.new(status, @account, preloaded_relations).filtered? }
  rescue Faraday::ConnectionFailed, Parslet::ParseFailed => e
    Rails.logger.warn "Search failed: #{e.message}"
    []
  end

  def build_optimized_search_request
    # 기존 파싱된 쿼리 사용
    base_request = parsed_query.request

    # 한국어 최적화 쿼리 추가
    if contains_korean?(@query)
      add_korean_optimized_query(base_request)
    elsif contains_only_english?(@query)
      add_english_optimized_query(base_request)
    else
      add_multilingual_query(base_request)
    end
  end

  def add_korean_optimized_query(base_request)
    # 한국어 검색 시 다중 필드 전략 적용
    base_request.query(
      bool: {
        should: [
          # 1. 원본 파싱된 쿼리 (기본 점수)
          base_request.query.to_h,
          
          # 2. 한국어 특화 필드 검색 (부스팅)
          {
            multi_match: {
              query: clean_query,
              fields: [
                'text.korean^3.0',      # 한국어 전용 필드에 가장 높은 가중치
                'text.content^2.5',     # 하이브리드 필드
                'text.personal^2.0',    # 개인 검색 특화 필드
                'text.social^1.5',      # SNS 특화 필드
                'account_display_name^1.2', # 계정명도 검색
              ],
              type: 'most_fields',
              minimum_should_match: '70%'
            }
          },

          # 3. 동의어 확장 검색
          {
            multi_match: {
              query: expand_synonyms(clean_query),
              fields: ['text.content^1.5', 'text.social^1.2'],
              type: 'phrase_prefix'
            }
          },

          # 4. 해시태그 검색 (# 제거해서 검색)
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
    # 영어 검색 시 최적화
    base_request.query(
      bool: {
        should: [
          base_request.query.to_h,
          {
            multi_match: {
              query: clean_query,
              fields: [
                'text.english^3.0',     # 영어 전용 필드
                'text.content^2.0',     # 하이브리드 필드
                'text^1.0'              # 원본 필드
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
    # 다국어 혼합 검색
    base_request.query(
      bool: {
        should: [
          base_request.query.to_h,
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
    
    # 한국어 쿼리인 경우 추가 정렬 기준
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

  # === 헬퍼 메소드들 ===

  def contains_korean?(text)
    return false if text.blank?
    # 한글 유니코드 범위 체크 (Elasticsearch 호환)
    !!(text =~ /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/)
  end

  def contains_only_english?(text)
    return false if text.blank?
    # 영어와 공통 기호만 포함
    !!(text =~ /\A[a-zA-Z0-9\s\-_@#.!?]+\z/)
  end

  def clean_query
    return '' if @query.blank?
    
    # 검색 쿼리 정리
    @query.gsub(/[^\w가-힣\s#@]/, ' ')  # 특수문자 제거 (한글, 영문, 숫자, #, @ 제외)
          .squeeze(' ')                  # 연속 공백 제거
          .strip
  end

  def expand_synonyms(query)
    return query if query.blank?

    # 한국어 동의어 확장 (안전한 버전 - 단일 단어만)
    synonyms = {
      'ㅋㅋ' => '웃김 funny lol',
      'ㅠㅠ' => '슬픔 sad crying',
      'ㄷㄷ' => '대단 amazing wow',
      '마스토돈' => 'mastodon 매스토돈',
      '감사' => 'thanks 고마워',
      '안녕' => 'hello hi bye',
    }

    expanded_query = query
    synonyms.each do |original, expansion|
      if expanded_query.include?(original)
        expanded_query += " #{expansion}"
      end
    end

    expanded_query
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