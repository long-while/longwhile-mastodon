# frozen_string_literal: true

class Api::V2::SearchController < Api::BaseController
  include Authorization

  RESULTS_LIMIT = 20
  MAX_RESULTS_LIMIT = 40  # 한국어 검색 최적화를 위한 확장 한계
  KOREAN_BOOST_LIMIT = 30 # 한국어 검색 시 더 많은 결과

  before_action -> { authorize_if_got_token! :read, :'read:search' }
  before_action :validate_search_params!
  before_action :normalize_search_query!

  with_options unless: :user_signed_in? do
    before_action :query_pagination_error, if: :pagination_requested?
    before_action :remote_resolve_error, if: :remote_resolve_requested?
  end
  before_action :require_valid_pagination_options!

  def index
    @search = Search.new(search_results)
    render json: @search, serializer: REST::SearchSerializer
  rescue Mastodon::SyntaxError => e
    Rails.logger.warn "Search syntax error: #{e.message} for query: '#{params[:q]}'"
    render json: { error: 'Invalid search syntax. Please check your query.' }, status: 422
  rescue ActiveRecord::RecordNotFound => e
    Rails.logger.warn "Search record not found: #{e.message}"
    not_found
  rescue StandardError => e
    Rails.logger.error "Search error: #{e.message} for query: '#{params[:q]}'"
    render json: { error: 'Search temporarily unavailable. Please try again.' }, status: 503
  end

  private

  def validate_search_params!
    params.require(:q)
    
    # 검색어 길이 체크
    if params[:q].length > 500
      render json: { error: 'Search query too long. Maximum 500 characters allowed.' }, status: 422
      return
    end

    # 빈 검색어 체크
    if params[:q].strip.empty?
      render json: { error: 'Search query cannot be empty.' }, status: 422
      return
    end
  end

  def normalize_search_query!
    return unless params[:q].present?

    # 검색어 정규화
    normalized = params[:q].strip
    
    # 연속된 공백 제거
    normalized = normalized.squeeze(' ')
    
    # 한국어 검색어 특별 처리
    if contains_korean?(normalized)
      # 한국어 자모 분리 문제 해결
      normalized = normalize_korean_chars(normalized)
      
      # 한국어 특수 표현 정규화
      normalized = normalize_korean_expressions(normalized)
    end
    
    # 이모지 정규화 (선택적)
    normalized = normalize_emojis(normalized) if params[:normalize_emojis] == 'true'
    
    params[:q] = normalized
  end

  def query_pagination_error
    render json: { 
      error: 'Search queries pagination is not supported without authentication',
      help: 'Please sign in to use pagination features'
    }, status: 401
  end

  def remote_resolve_error
    render json: { 
      error: 'Search queries that resolve remote resources are not supported without authentication',
      help: 'Please sign in to search remote resources'
    }, status: 401
  end

  def remote_resolve_requested?
    truthy_param?(:resolve)
  end

  def pagination_requested?
    params[:offset].present?
  end

  def search_results
    # 한국어 검색인 경우 한계치 조정
    effective_limit = determine_effective_limit
    
    SearchService.new.call(
      params[:q],
      current_account,
      effective_limit,
      combined_search_params
    )
  end

  def combined_search_params
    base_params = search_params.merge(
      resolve: truthy_param?(:resolve),
      exclude_unreviewed: truthy_param?(:exclude_unreviewed),
      following: truthy_param?(:following)
    )

    # 한국어 검색 최적화 파라미터 추가
    if contains_korean?(params[:q])
      base_params.merge!(
        korean_optimized: true,
        boost_korean_content: true,
        expand_synonyms: truthy_param?(:expand_synonyms, default: true)
      )
    end

    # 검색 타입별 최적화
    if hashtag_search?
      base_params.merge!(hashtag_boost: 1.5)
    elsif mention_search?
      base_params.merge!(account_boost: 2.0)
    end

    base_params
  end

  def search_params
    params.permit(:type, :offset, :min_id, :max_id, :account_id, :following, :expand_synonyms, :normalize_emojis)
  end

  def determine_effective_limit
    requested_limit = limit_param(RESULTS_LIMIT)
    
    # 한국어 검색인 경우 더 많은 결과 허용
    if contains_korean?(params[:q])
      [requested_limit, KOREAN_BOOST_LIMIT].min
    else
      [requested_limit, MAX_RESULTS_LIMIT].min
    end
  end

  # === 헬퍼 메소드들 ===

  def contains_korean?(text)
    return false if text.blank?
    # 한글 유니코드 범위 체크 (Elasticsearch 호환)
    !!(text =~ /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/)
  end

  def hashtag_search?
    params[:q]&.start_with?('#')
  end

  def mention_search?
    params[:q]&.start_with?('@')
  end

  def normalize_korean_chars(text)
    # 한글 자모 정규화 (NFD -> NFC)
    text.unicode_normalize(:nfc)
  rescue StandardError
    text # 정규화 실패시 원본 반환
  end

  def normalize_korean_expressions(text)
    # 한국어 표현 정규화
    normalized = text.dup
    
    # ㅋㅋ 계열 정규화
    normalized.gsub!(/ㅋ{2,}/, 'ㅋㅋ')
    normalized.gsub!(/ㅎ{2,}/, 'ㅎㅎ')
    
    # ㅠㅠ 계열 정규화  
    normalized.gsub!(/ㅠ{2,}/, 'ㅠㅠ')
    normalized.gsub!(/ㅜ{2,}/, 'ㅜㅜ')
    
    # ㅡㅡ 계열 정규화
    normalized.gsub!(/ㅡ{2,}/, 'ㅡㅡ')
    
    # 의미없는 반복 제거
    normalized.gsub!(/(.)\1{3,}/, '\1\1')  # 4개 이상 반복을 2개로
    
    normalized
  end

  def normalize_emojis(text)
    # 이모지를 텍스트로 변환 (선택적 기능)
    emoji_map = {
      '😀' => 'smile',
      '😂' => 'laugh',  
      '😭' => 'cry',
      '👍' => 'good',
      '❤️' => 'love',
      '🔥' => 'fire',
      '💯' => 'perfect'
    }
    
    normalized = text.dup
    emoji_map.each do |emoji, word|
      normalized.gsub!(emoji, " #{word} ")
    end
    
    normalized.squeeze(' ').strip
  end

  def truthy_param?(key, default: false)
    return default if params[key].blank?
    
    case params[key].to_s.downcase
    when 'true', '1', 'yes', 'on'
      true
    when 'false', '0', 'no', 'off'
      false
    else
      default
    end
  end
end