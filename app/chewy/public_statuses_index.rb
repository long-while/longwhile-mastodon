# frozen_string_literal: true

class PublicStatusesIndex < Chewy::Index
  include DatetimeClampingConcern

  settings index: index_preset(refresh_interval: '30s', number_of_shards: 5), analysis: {
    # === 문자 필터 (Character Filters) ===
    char_filter: {
      # 이모지와 특수문자 정규화 (Elasticsearch 호환 형식)
      emoji_normalizer: {
        type: 'pattern_replace',
        pattern: '[\uD83D\uDE00-\uD83D\uDE4F\uD83C\uDF00-\uD83D\uDFFF\u2600-\u26FF\u2700-\u27BF]',
        replacement: ' EMOJI ',
      },

      # URL 정규화
      url_normalizer: {
        type: 'pattern_replace',
        pattern: 'https?://[^\\s]+',
        replacement: ' URL ',
      },

      # 멘션 정규화  
      mention_normalizer: {
        type: 'pattern_replace',
        pattern: '@[\\w]+',
        replacement: ' MENTION ',
      },

      # 해시태그에서 # 제거 (내용만 보존)
      hashtag_cleaner: {
        type: 'pattern_replace',
        pattern: '#([\\w\\uAC00-\\uD7AF]+)',
        replacement: '$1',
      },
    },

    # === 토큰 필터 (Token Filters) ===
    filter: {
      # 영어 관련 필터
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

      # 한국어 품사 필터 - Discord/SNS 특화 최적화 (수정된 태그)
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

      # 한국어 읽기 형태 필터 (한자→한글)
      korean_readingform: {
        type: 'nori_readingform',
      },

      # 한국어 숫자 정규화 필터
      korean_number: {
        type: 'nori_number',
      },

      # 한국어 불용어 필터 - SNS 특화
      korean_stop: {
        type: 'stop',
        stopwords: %w[
          그 이 저 것 수 있 하 되 들 만 더 또 및 등 때 위 통해 대한 같은 경우 따라
          그리고 하지만 그러나 또한 즉 예를 들어 만약 그래서 따라서 그런데 그렇지만
          좀 진짜 완전 너무 정말 엄청 매우 아주 되게 왜 뭐 어 음 아 오 이제 지금 바로
          ㅋㅋ ㅎㅎ ㅠㅠ ㅜㅜ ㅡㅡ ㄷㄷ ㅋㅋㅋ ㅎㅎㅎ 
        ],
      },

      # CJK 너비 정규화 (전각↔반각)
      cjk_width_filter: {
        type: 'cjk_width',
      },

      # 단어 구분자 필터 - 해시태그 분해용
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

      # 동의어 필터 - SNS 표현 통일
      synonym_filter: {
        type: 'synonym',
        synonyms: [
          'ㅋㅋ,ㅋㅋㅋ,kkk,lol,웃김,웃겨,funny',
          'ㅠㅠ,ㅜㅜ,슬픔,sad,crying',
          'ㄷㄷ,대단,amazing,wow,굿',
          '마스토돈,mastodon,매스토돈',
          '트위터,twitter,트윗',
          'ok,오케이,좋아,굿',
          '안녕하세요,안녕,hello,hi',
          '감사합니다,감사,thank you,thanks,thx,고마워',
        ],
      },

      # 길이 기반 필터 - 너무 짧거나 긴 토큰 제거
      length_filter: {
        type: 'length',
        min: 1,
        max: 50,
      },

      # 대소문자 정규화
      lowercase_filter: {
        type: 'lowercase',
      },

      # ASCII 폴딩 (악센트 제거)
      asciifolding_filter: {
        type: 'asciifolding',
        preserve_original: false,
      },
    },

    # === 토크나이저 (Tokenizers) ===
    tokenizer: {
      # 한국어 토크나이저 - SNS 특화 사용자 사전
      nori_user_dict: {
        type: 'nori_tokenizer',
        decompound_mode: 'mixed',
        discard_punctuation: false,  # 중요: nori_number 필터와 호환성
        user_dictionary_rules: [
          # === SNS/소셜미디어 관련 ===
          '마스토돈', '매스토돈', 'mastodon',
          '트위터', '인스타그램', '페이스북', '유튜브', '틱톡',
          '인스타', '페북', '유투브',
          '툿', 'toot', '툿팅', '리툿', 'retoot',
          '팔로우', '언팔로우', '팔로워', '팔로잉',
          '즐겨찾기', '북마크', '멘션', '리블로그',
          '해시태그', 'hashtag', '태그',
          '타임라인', 'timeline', 'TL',
          '디엠', 'DM', '다이렉트메시지',

          # === 기술/개발 관련 ===
          '엘라스틱서치', 'elasticsearch', 'ES',
          '깃허브', 'github', '깃',
          '도커', 'docker', '쿠버네티스', 'kubernetes',
          '파이썬', 'python', '자바스크립트', 'javascript',
          '리액트', 'react', '뷰', 'vue', '앵귤러', 'angular',
          'AI', '인공지능', '머신러닝', '딥러닝',
          'GPT', '챗GPT', 'ChatGPT',

          # === 일반 용어 ===
          '바나나', '아이폰', 'iPhone', '안드로이드', 'android',
          '맥북', 'MacBook', '윈도우', 'windows',
          '코로나', 'COVID', 'COVID-19', '코비드',
          '오미크론', '델타', '백신',
          '넷플릭스', 'Netflix', '디즈니플러스',

          # === 한국 고유명사 ===
          '서울', '부산', '대구', '인천', '광주', '대전', '울산',
          '경기도', '강원도', '충청도', '전라도', '경상도', '제주도',
          '청와대', '국회', '정부', '대통령', '총리',
          'KBS', 'MBC', 'SBS', '네이버', '카카오', '라인',
          '삼성', '현대', 'LG', 'SK',

          # === 이모티콘/감정 표현 ===
          'ㅋㅋ', 'ㅋㅋㅋ', 'ㅎㅎ', 'ㅎㅎㅎ',
          'ㅠㅠ', 'ㅜㅜ', 'ㅡㅡ', 'ㄷㄷ',
          '헐', '와우', '대박', '쩔어', '개쩜',
        ],
      },

      # URL과 이메일을 위한 토크나이저
      uax_url_email_tokenizer: {
        type: 'uax_url_email',
      },

      # 키워드 토크나이저 (해시태그용)
      keyword_tokenizer: {
        type: 'keyword',
      },

      # 공백 기반 토크나이저 (단순 분할용)
      whitespace_tokenizer: {
        type: 'whitespace',
      },
    },

    # === 분석기 (Analyzers) ===
    analyzer: {
      # 원문 보존 분석기 (URL, 멘션 등)
      verbatim: {
        char_filter: %w[url_normalizer mention_normalizer],
        tokenizer: 'uax_url_email_tokenizer',
        filter: %w[lowercase_filter length_filter],
      },

      # 메인 컨텐츠 분석기 - 한국어/영어 하이브리드 최적화
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
          synonym_filter
          english_possessive_stemmer
          english_stop
          english_stemmer
          length_filter
        ],
      },

      # 해시태그 분석기 - SNS 특화
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

      # 한국어 전용 분석기 - 정밀 매칭용
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
          synonym_filter
          length_filter
        ],
      },

      # 영어 전용 분석기 - 성능 최적화
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

      # SNS 특화 분석기 - 감정 표현 및 은어 처리
      social_media: {
        char_filter: %w[emoji_normalizer url_normalizer mention_normalizer hashtag_cleaner],
        tokenizer: 'whitespace_tokenizer',
        filter: %w[
          lowercase_filter
          cjk_width_filter
          synonym_filter
          korean_stop
          english_stop
          length_filter
        ],
      },

      # 검색 쿼리 전용 분석기 - 관대한 매칭
      search_query: {
        tokenizer: 'nori_user_dict',
        filter: %w[
          korean_pos_filter
          korean_readingform
          korean_number
          lowercase_filter
          asciifolding_filter
          cjk_width_filter
          synonym_filter
          english_possessive_stemmer
          length_filter
        ],
      },
    },
  }

  index_scope ::Status.unscoped
                      .kept
                      .indexable
                      .includes(:media_attachments, :preloadable_poll, :tags, preview_cards_status: :preview_card)

  root date_detection: false do
    field(:id, type: 'long')
    field(:account_id, type: 'long')
    
    # 메인 텍스트 필드 - 다중 분석 전략
    field(:text, type: 'text', analyzer: 'verbatim', search_analyzer: 'search_query', value: ->(status) { status.searchable_text }) do
      field(:content, type: 'text', analyzer: 'content', search_analyzer: 'search_query')
      field(:korean, type: 'text', analyzer: 'korean_only', search_analyzer: 'search_query')
      field(:english, type: 'text', analyzer: 'english_only')
      field(:social, type: 'text', analyzer: 'social_media', search_analyzer: 'search_query')
    end
    
    # 해시태그 필드 - SNS 특화 처리
    field(:tags, type: 'text', analyzer: 'hashtag', value: ->(status) { status.tags.map(&:display_name) })
    
    # 언어 필드 - 향후 언어별 부스팅용
    field(:language, type: 'keyword')
    
    # 속성 필드 - 필터링용
    field(:properties, type: 'keyword', value: ->(status) { status.searchable_properties })
    
    # 생성일 필드 - 시간 기반 부스팅용
    field(:created_at, type: 'date', value: ->(status) { clamp_date(status.created_at) })

    # 계정 정보 추가 - 계정별 검색 향상
    field(:account_username, type: 'keyword', value: ->(status) { status.account.username })
    field(:account_display_name, type: 'text', analyzer: 'content', value: ->(status) { status.account.display_name })
    
    # 인기도 지표 - 향후 랭킹 개선용
    field(:favourites_count, type: 'integer', value: ->(status) { status.favourites_count })
    field(:reblogs_count, type: 'integer', value: ->(status) { status.reblogs_count })
    field(:replies_count, type: 'integer', value: ->(status) { status.replies_count })
  end
end