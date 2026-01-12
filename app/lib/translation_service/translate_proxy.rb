# frozen_string_literal: true

class TranslationService::TranslateProxy < TranslationService
  include JsonLdHelper

  def initialize(endpoint, papago_client_id, papago_client_secret)
    super()

    @endpoint = endpoint

    @papago_endpoint = 'https://openapi.naver.com/v1/papago/n2mt'
    @papago_languages = %w(ko en ja zh zh-CN zh-TW es fr de ru pt it vi th id hi)
    @papago_client_id = papago_client_id
    @papago_client_secret = papago_client_secret
  end

  def translate(texts, source_language, target_language)
    texts.map do |text|
      translate_text(text, source_language, target_language)
    end
  end

  def translate_text(text, source_language, target_language)
    use_papago = @papago_client_id.present? && @papago_languages.include?(source_language) && @papago_languages.include?(target_language)

    text = sanitize(text)

    begin
      return translate_papago(text, source_language, target_language) if use_papago

      translate_proxy(text, source_language, target_language)
    rescue QuotaExceededError, UnexpectedResponseError
      translate_proxy(text, source_language, target_language)
    end
  end

  def languages
    # List all language codes that supported by google translate in 2 letter format
    # https://cloud.google.com/translate/docs/languages
    # Papago is not considered because papago has smaller set of supported languages
    target_languages = %w(af sq am ar hy as ay az bm eu be bn bho bs bg ca ceb zh zh-CN zh-TW co hr cs da dv doi nl en eo et ee fil fi fr fy gl ka de el gn gu ht ha haw he hi hmn hu is ig ilo id ga it ja jv kn kk km rw gom ko kri ku ckb ky lo la lv ln lt lg lb mk mai mg ms ml mt mi mr mni-Mtei lus mn my ne no ny or om ps fa pl pt pa qu ro ru sm sa gd nso sr st sn sd si sk sl so es su sw sv tl tg ta tt te th ti ts tr tk ak uk ur ug uz vi cy xh yi yo zu)
    source_languages = [nil] + target_languages

    source_languages.index_with { |language| target_languages.without(nil, language) }
  end

  private

  def sanitize(text)
    text
      .gsub(%r{<br\s*/?>}, "\n") # Replace br tag to newline
      .gsub(%r{</?[^>]+?>}, '') # Remove HTML tags
  end

  def restore_text(text)
    # Restore newline
    text.gsub("\n", '<br />') if text.present?
  end

  def translate_papago(text, source_language, target_language)
    Request.new(:post, @papago_endpoint, form: {
      source: source_language,
      target: target_language,
      text: text,
    }).add_headers(
      'X-Naver-Client-Id' => @papago_client_id,
      'X-Naver-Client-Secret' => @papago_client_secret,
      'Content-Type' => 'application/x-www-form-urlencoded; charset=UTF-8'
    ).perform do |res|
      case res.code
      when 429
        raise QuotaExceededError
      when 200...300
        transform_response_papago(res.body_with_limit, source_language)
      else
        raise UnexpectedResponseError
      end
    end
  end

  def translate_proxy(text, source_language, target_language)
    Request.new(:post, "#{@endpoint}/#{target_language}", form: { text: text }).perform do |res|
      case res.code
      when 429
        raise TooManyRequestsError
      when 456
        raise QuotaExceededError
      when 200...300
        transform_response_gproxy(res.body_with_limit, source_language)
      else
        raise UnexpectedResponseError
      end
    end
  end

  def transform_response_papago(str, source_language)
    json = Oj.load(str, mode: :strict)

    raise UnexpectedResponseError unless json.is_a?(Hash)

    text = json['message']['result']['translatedText']
    provider = 'Papago'

    text = restore_text(text)

    Translation.new(
      text: text,
      detected_source_language: source_language,
      provider: provider
    )
  rescue Oj::ParseError
    raise UnexpectedResponseError
  end

  def transform_response_gproxy(str, source_language)
    json = Oj.load(str, mode: :strict)

    raise UnexpectedResponseError unless json.is_a?(Hash)

    text = json['text']
    provider = 'Google Translate'

    text = restore_text(text)
    source_language = json['lang'] || source_language

    Translation.new(
      text: text,
      detected_source_language: source_language,
      provider: provider
    )
  rescue Oj::ParseError
    raise UnexpectedResponseError
  end
end
