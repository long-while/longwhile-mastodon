# frozen_string_literal: true

class SearchQueryTransformer < Parslet::Transform
  SUPPORTED_PREFIXES = %w(
    has
    is
    language
    from
    before
    after
    during
    in
  ).freeze

  class Query
    def initialize(clauses, options = {})
      raise ArgumentError if options[:current_account].nil?

      @clauses = clauses
      @options = options

      flags_from_clauses!
    end

    def request
      search = Chewy::Search::Request.new(*indexes).filter(default_filter)

      must_clauses.each { |clause| search = search.query.must(clause.to_query) }
      must_not_clauses.each { |clause| search = search.query.must_not(clause.to_query) }
      filter_clauses.each { |clause| search = search.filter(**clause.to_query) }

      search
    end

    private

    def clauses_by_operator
      @clauses_by_operator ||= @clauses.compact.chunk(&:operator).to_h
    end

    def flags_from_clauses!
      @flags = clauses_by_operator.fetch(:flag, []).to_h { |clause| [clause.prefix, clause.term] }
    end

    def must_clauses
      clauses_by_operator.fetch(:must, [])
    end

    def must_not_clauses
      clauses_by_operator.fetch(:must_not, [])
    end

    def filter_clauses
      clauses_by_operator.fetch(:filter, [])
    end

    def indexes
      case @flags['in']
      when 'library'
        [StatusesIndex]
      when 'public'
        [PublicStatusesIndex]
      else
        [PublicStatusesIndex, StatusesIndex]
      end
    end

    # ─── @_longwhile custom feature / 한참(longwhile) 제작 기능 — 검색 범위 제한(나+팔로잉) ───
    # 사용·재사용 시 서버 내 출처 표기 필수 / Credit required to use or reuse:
    #   Twitter/X @_longwhile · Crepe https://kre.pe/QTRx
    def default_filter
      account_id = @options[:current_account].id
      following_ids = @options[:current_account].active_relationships.pluck(:target_account_id)
      allowed_account_ids = following_ids + [account_id]

      {
        bool: {
          should: [
            # PublicStatusesIndex: 나+팔로잉 유저의 public/unlisted 툿
            {
              bool: {
                must: [
                  {
                    term: {
                      _index: PublicStatusesIndex.index_name,
                    },
                  },
                  {
                    terms: {
                      account_id: allowed_account_ids,
                    },
                  },
                ],
              },
            },
            # StatusesIndex: 나+팔로잉 유저가 작성한 모든 visibility 툿
            # OR 나를 멘션/즐겨찾기/북마크한 툿
            {
              bool: {
                must: [
                  {
                    term: {
                      _index: StatusesIndex.index_name,
                    },
                  },
                ],
                should: [
                  {
                    terms: {
                      account_id: allowed_account_ids,
                    },
                  },
                  {
                    term: {
                      searchable_by: account_id,
                    },
                  },
                ],
                minimum_should_match: 1,
              },
            },
          ],

          minimum_should_match: 1,
        },
      }
    end
  end

  class Operator
    class << self
      def symbol(str)
        case str
        when '+', nil
          :must
        when '-'
          :must_not
        else
          raise "Unknown operator: #{str}"
        end
      end
    end
  end

  class TermClause
    attr_reader :operator, :term

    def initialize(operator, term)
      @operator = Operator.symbol(operator)
      @term = term
    end

    def to_query
      if @term.start_with?('#')
        { match: { tags: { query: @term, operator: 'and' } } }
      else
        { multi_match: { type: 'most_fields', query: @term, fields: ['text', 'text.stemmed'], operator: 'and' } }
      end
    end
  end

  class PhraseClause
    attr_reader :operator, :phrase

    def initialize(operator, phrase)
      @operator = Operator.symbol(operator)
      @phrase = phrase
    end

    def to_query
      { match_phrase: { text: { query: @phrase } } }
    end
  end

  class PrefixClause
    EPOCH_RE = /\A\d+\z/

    attr_reader :operator, :prefix, :term

    def initialize(prefix, operator, term, options = {})
      @prefix = prefix
      @negated = operator == '-'
      @options = options
      @operator = :filter

      case prefix
      when 'has', 'is'
        @filter = :properties
        @type = :term
        @term = term
      when 'language'
        @filter = :language
        @type = :term
        @term = language_code_from_term(term)
      when 'from'
        @filter = :account_id
        @type = :term
        @term = account_id_from_term(term)
      when 'before'
        @filter = :created_at
        @type = :range
        @term = { lt: date_from_term(term), time_zone: @options[:current_account]&.user_time_zone.presence || 'UTC' }
      when 'after'
        @filter = :created_at
        @type = :range
        @term = { gt: date_from_term(term), time_zone: @options[:current_account]&.user_time_zone.presence || 'UTC' }
      when 'during'
        @filter = :created_at
        @type = :range
        @term = { gte: date_from_term(term), lte: date_from_term(term), time_zone: @options[:current_account]&.user_time_zone.presence || 'UTC' }
      when 'in'
        @operator = :flag
        @term = term
      else
        raise "Unknown prefix: #{prefix}"
      end
    end

    def to_query
      if @negated
        { bool: { must_not: { @type => { @filter => @term } } } }
      else
        { @type => { @filter => @term } }
      end
    end

    private

    def account_id_from_term(term)
      return @options[:current_account]&.id || -1 if term == 'me'

      username, domain = term.gsub(/\A@/, '').split('@')
      domain = nil if TagManager.instance.local_domain?(domain)
      account = Account.find_remote(username, domain)

      # If the account is not found, we want to return empty results, so return
      # an ID that does not exist
      account&.id || -1
    end

    def language_code_from_term(term)
      language_code = term

      return language_code if LanguagesHelper::SUPPORTED_LOCALES.key?(language_code.to_sym)

      language_code = term.downcase

      return language_code if LanguagesHelper::SUPPORTED_LOCALES.key?(language_code.to_sym)

      language_code = term.split(/[_-]/).first.downcase

      return language_code if LanguagesHelper::SUPPORTED_LOCALES.key?(language_code.to_sym)

      term
    end

    def date_from_term(term)
      DateTime.iso8601(term) unless term.match?(EPOCH_RE) # This will raise Date::Error if the date is invalid
      term
    end
  end

  rule(clause: subtree(:clause)) do
    prefix   = clause[:prefix][:term].to_s.downcase if clause[:prefix]
    operator = clause[:operator]&.to_s
    term     = clause[:phrase] ? clause[:phrase].map { |term| term[:term].to_s }.join(' ') : clause[:term].to_s

    if clause[:prefix] && SUPPORTED_PREFIXES.include?(prefix)
      PrefixClause.new(prefix, operator, term, current_account: current_account)
    elsif clause[:prefix]
      TermClause.new(operator, "#{prefix} #{term}")
    elsif clause[:term]
      TermClause.new(operator, term)
    elsif clause[:phrase]
      PhraseClause.new(operator, term)
    else
      raise "Unexpected clause type: #{clause}"
    end
  end

  rule(junk: subtree(:junk)) do
    nil
  end

  rule(query: sequence(:clauses)) do
    Query.new(clauses, current_account: current_account)
  end
end
