# frozen_string_literal: true

class PublicStatusesIndex < Chewy::Index
  include DatetimeClampingConcern

  settings index: index_preset(refresh_interval: '30s', number_of_shards: 5), analysis: {
    char_filter: {
      emoji_normalizer: {
        type: 'pattern_replace',
        pattern: '[\uD83D\uDE00-\uD83D\uDE4F\uD83C\uDF00-\uD83D\uDFFF\u2600-\u26FF\u2700-\u27BF]',
        replacement: ' EMOJI ',
      },

      url_normalizer: {
        type: 'pattern_replace',
        pattern: 'https?://[^\\s]+',
        replacement: ' URL ',
      },

      mention_normalizer: {
        type: 'pattern_replace',
        pattern: '@[\\w]+',
        replacement: ' MENTION ',
      },

      hashtag_cleaner: {
        type: 'pattern_replace',
        pattern: '#([\\w\\uAC00-\\uD7AF]+)',
        replacement: '$1',
      },
    },

    filter: {
      english_stop: {
        type: 'stop',
        stopwords: '_english_',
      },

      english_stemmer: {
        type: 'stemmer',
        language: 'english',
      },

      english_possessive_stemmer: {
        type: 'stemmer',
        language: 'possessive_english',
      },

      korean_pos_filter: {
        type: 'nori_part_of_speech',
        stoptags: %w[
          E
          IC
          J
          MAG
          MAJ
          MM
          SP
          SSC
          SSO
          SC
          SE
          XPN
          XSA
          XSN
          XSV
          UNA
          NA
          VSV
          VCP
          VCN
        ],
      },

      korean_readingform: {
        type: 'nori_readingform',
      },

      korean_number: {
        type: 'nori_number',
      },

      korean_stop: {
        type: 'stop',
        stopwords: %w[
          그 이 저 것 수 있 하 되 들 만 더 또 및 등 때 위 통해 대한 같은 경우 따라
          그리고 하지만 그러나 또한 즉 예를 들어 만약 그래서 따라서 그런데 그렇지만
          좀 진짜 완전 너무 정말 엄청 매우 아주 되게 왜 뭐 어 음 아 오 이제 지금 바로
          ㅋㅋ ㅎㅎ ㅠㅠ ㅜㅜ ㅡㅡ ㄷㄷ ㅋㅋㅋ ㅎㅎㅎ 
        ],
      },

      cjk_width_filter: {
        type: 'cjk_width',
      },

      word_delimiter: {
        type: 'word_delimiter_graph',
        generate_word_parts: true,
        generate_number_parts: true,
        catenate_words: true,
        catenate_numbers: true,
        catenate_all: false,
        split_on_case_change: true,
        preserve_original: false,
      },

      length_filter: {
        type: 'length',
        min: 1,
        max: 50,
      },

      lowercase_filter: {
        type: 'lowercase',
      },

      asciifolding_filter: {
        type: 'asciifolding',
        preserve_original: false,
      },
    },

    tokenizer: {
      nori_user_dict: {
        type: 'nori_tokenizer',
        decompound_mode: 'mixed',
        discard_punctuation: false,
        user_dictionary_rules: [
          '마스토돈', '매스토돈', 'mastodon',
          '트위터', '인스타그램', '페이스북', '유튜브', '틱톡',
          '인스타', '페북', '유투브',
          '툿', 'toot', '툿팅', '리툿', 'retoot',
          '팔로우', '언팔로우', '팔로워', '팔로잉',
          '마음에 들어요', '북마크', '멘션', '리블로그',
          '해시태그', 'hashtag', '태그',
          '타임라인', 'timeline', 'TL',
          '디엠', 'DM', '다이렉트메시지',

          '엘라스틱서치', 'elasticsearch', 'ES',
          '깃허브', 'github', '깃',
          '도커', 'docker', '쿠버네티스', 'kubernetes',
          '파이썬', 'python', '자바스크립트', 'javascript',
          '리액트', 'react', '뷰', 'vue', '앵귤러', 'angular',
          'AI', '인공지능', '머신러닝', '딥러닝',
          'GPT', '챗GPT', 'ChatGPT',

          '바나나', '아이폰', 'iPhone', '안드로이드', 'android',
          '맥북', 'MacBook', '윈도우', 'windows',
          '코로나', 'COVID', 'COVID-19', '코비드',
          '오미크론', '델타', '백신',
          '넷플릭스', 'Netflix', '디즈니플러스',

          '서울', '부산', '대구', '인천', '광주', '대전', '울산',
          '경기도', '강원도', '충청도', '전라도', '경상도', '제주도',
          '청와대', '국회', '정부', '대통령', '총리',
          'KBS', 'MBC', 'SBS', '네이버', '카카오', '라인',
          '삼성', '현대', 'LG', 'SK',

          'ㅋㅋ', 'ㅋㅋㅋ', 'ㅎㅎ', 'ㅎㅎㅎ',
          'ㅠㅠ', 'ㅜㅜ', 'ㅡㅡ', 'ㄷㄷ',
          '헐', '와우', '대박', '쩔어', '개쩜',
        ],
      },

      uax_url_email_tokenizer: {
        type: 'uax_url_email',
      },

      keyword_tokenizer: {
        type: 'keyword',
      },

      whitespace_tokenizer: {
        type: 'whitespace',
      },
    },

    analyzer: {
      verbatim: {
        char_filter: %w[url_normalizer mention_normalizer],
        tokenizer: 'uax_url_email_tokenizer',
        filter: %w[lowercase_filter length_filter],
      },

      content: {
        char_filter: %w[emoji_normalizer url_normalizer mention_normalizer],
        tokenizer: 'nori_user_dict',
        filter: %w[
          korean_pos_filter
          korean_readingform
          korean_number
          lowercase_filter
          asciifolding_filter
          cjk_width_filter
          korean_stop
          english_possessive_stemmer
          english_stop
          english_stemmer
          length_filter
        ],
      },

      hashtag: {
        char_filter: %w[hashtag_cleaner],
        tokenizer: 'keyword_tokenizer',
        filter: %w[
          word_delimiter
          lowercase_filter
          asciifolding_filter
          cjk_width_filter
          length_filter
        ],
      },

      korean_only: {
        char_filter: %w[emoji_normalizer],
        tokenizer: 'nori_user_dict',
        filter: %w[
          korean_pos_filter
          korean_readingform
          korean_number
          lowercase_filter
          cjk_width_filter
          korean_stop
          length_filter
        ],
      },

      english_only: {
        char_filter: %w[emoji_normalizer url_normalizer mention_normalizer],
        tokenizer: 'standard',
        filter: %w[
          lowercase_filter
          asciifolding_filter
          english_possessive_stemmer
          english_stop
          english_stemmer
          length_filter
        ],
      },

      social_media: {
        char_filter: %w[emoji_normalizer url_normalizer mention_normalizer hashtag_cleaner],
        tokenizer: 'whitespace_tokenizer',
        filter: %w[
          lowercase_filter
          cjk_width_filter
          korean_stop
          english_stop
          length_filter
        ],
      },

      search_query: {
        tokenizer: 'nori_user_dict',
        filter: %w[
          korean_pos_filter
          korean_readingform
          korean_number
          lowercase_filter
          asciifolding_filter
          cjk_width_filter
          english_possessive_stemmer
          length_filter
        ],
      },
    },
  }

  index_scope ::Status.unscoped
                      .kept
                      .indexable
                      .includes(:media_attachments, :preloadable_poll, :tags, :quote, preview_cards_status: :preview_card)

  root date_detection: false do
    field(:id, type: 'long')
    field(:account_id, type: 'long')
    
    field(:text, type: 'text', analyzer: 'verbatim', search_analyzer: 'search_query', value: ->(status) { status.searchable_text }) do
      field(:content, type: 'text', analyzer: 'content', search_analyzer: 'search_query')
      field(:korean, type: 'text', analyzer: 'korean_only', search_analyzer: 'search_query')
      field(:english, type: 'text', analyzer: 'english_only')
      field(:social, type: 'text', analyzer: 'social_media', search_analyzer: 'search_query')
    end
    
    field(:tags, type: 'text', analyzer: 'hashtag', value: ->(status) { status.tags.map(&:display_name) })
    
    field(:language, type: 'keyword')
    
    field(:properties, type: 'keyword', value: ->(status) { status.searchable_properties })
    
    field(:created_at, type: 'date', value: ->(status) { clamp_date(status.created_at) })

    field(:account_username, type: 'keyword', value: ->(status) { status.account.username })
    field(:account_display_name, type: 'text', analyzer: 'content', value: ->(status) { status.account.display_name })
    
    field(:favourites_count, type: 'integer', value: ->(status) { status.favourites_count })
    field(:reblogs_count, type: 'integer', value: ->(status) { status.reblogs_count })
    field(:replies_count, type: 'integer', value: ->(status) { status.replies_count })
  end
end