# frozen_string_literal: true

class Api::V2::SearchController < Api::BaseController
  include AsyncRefreshesConcern
  include Authorization

  RESULTS_LIMIT = 20
  MAX_RESULTS_LIMIT = 40
  KOREAN_BOOST_LIMIT = 30

  before_action -> { authorize_if_got_token! :read, :'read:search' }
  before_action :validate_search_params!
  before_action :normalize_search_query!

  with_options unless: :user_signed_in? do
    before_action :query_pagination_error, if: :pagination_requested?
    before_action :remote_resolve_error, if: :remote_resolve_requested?
  end
  before_action :require_valid_pagination_options!
  before_action :handle_fasp_requests

  def index
    @search = Search.new(search_results)
    render json: @search, serializer: REST::SearchSerializer
  rescue Mastodon::SyntaxError => e
    Rails.logger.warn "Search syntax error: #{e.message} (query length: #{params[:q].to_s.length})"
    render json: { error: 'Invalid search syntax. Please check your query.' }, status: 422
  rescue ActiveRecord::RecordNotFound => e
    Rails.logger.warn "Search record not found: #{e.message}"
    not_found
  rescue StandardError => e
    Rails.logger.error "Search error: #{e.message} (query length: #{params[:q].to_s.length})"
    render json: { error: 'Search temporarily unavailable. Please try again.' }, status: 503
  end

  private

  def validate_search_params!
    params.require(:q)

    raise Mastodon::InvalidParameterError, 'Search query must be a single string' unless params[:q].is_a?(String)
    
    if params[:q].length > 500
      render json: { error: 'Search query too long. Maximum 500 characters allowed.' }, status: 422
      return
    end

    if params[:q].strip.empty?
      render json: { error: 'Search query cannot be empty.' }, status: 422
      return
    end
  end

  def normalize_search_query!
    return unless params[:q].present?

    normalized = params[:q].strip
    
    normalized = normalized.squeeze(' ')
    
    if contains_korean?(normalized)
      normalized = normalize_korean_chars(normalized)
      
      normalized = normalize_korean_expressions(normalized)
    end
    
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

  def handle_fasp_requests
    return unless Mastodon::Feature.fasp_enabled?
    return if params[:q].blank?

    # Do not schedule a new retrieval if the request is a follow-up
    # to an earlier retrieval
    return if request.headers['Mastodon-Async-Refresh-Id'].present?

    refresh_key = "fasp:account_search:#{Digest::MD5.base64digest(params[:q])}"
    return if AsyncRefresh.new(refresh_key).running?

    add_async_refresh_header(AsyncRefresh.create(refresh_key))
    @query_fasp = true
  end

  def remote_resolve_requested?
    truthy_param?(:resolve)
  end

  def pagination_requested?
    params[:offset].present?
  end

  def search_results
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
      following: truthy_param?(:following),
      query_fasp: @query_fasp
    )

    if contains_korean?(params[:q])
      base_params.merge!(
        korean_optimized: true,
        boost_korean_content: true,
      )
    end

    if hashtag_search?
      base_params.merge!(hashtag_boost: 1.5)
    elsif mention_search?
      base_params.merge!(account_boost: 2.0)
    end

    base_params
  end

  def search_params
    params.permit(:type, :offset, :min_id, :max_id, :account_id, :following, :normalize_emojis)
  end

  def determine_effective_limit
    requested_limit = limit_param(RESULTS_LIMIT)
    
    if contains_korean?(params[:q])
      [requested_limit, KOREAN_BOOST_LIMIT].min
    else
      [requested_limit, MAX_RESULTS_LIMIT].min
    end
  end

  def contains_korean?(text)
    return false if text.blank?
    !!(text =~ /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/)
  end

  def hashtag_search?
    params[:q]&.start_with?('#')
  end

  def mention_search?
    params[:q]&.start_with?('@')
  end

  def normalize_korean_chars(text)
    text.unicode_normalize(:nfc)
  rescue StandardError
    text
  end

  def normalize_korean_expressions(text)
    normalized = text.dup
    
    normalized.gsub!(/ㅋ{2,}/, 'ㅋㅋ')
    normalized.gsub!(/ㅎ{2,}/, 'ㅎㅎ')
    
    normalized.gsub!(/ㅠ{2,}/, 'ㅠㅠ')
    normalized.gsub!(/ㅜ{2,}/, 'ㅜㅜ')
    
    normalized.gsub!(/ㅡ{2,}/, 'ㅡㅡ')
    
    normalized.gsub!(/(.)\1{3,}/, '\1\1')
    
    normalized
  end

  def normalize_emojis(text)
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