# frozen_string_literal: true

module SystemHelpers
  # 웹 앱도 언제나 한국어로 뜬다(Localized#requested_locale). ko.json 에 없는 키는 앱이 영어
  # 기본 문구를 쓰므로 en.json 위에 덮는다.
  FRONTEND_TRANSLATIONS = %w(en ko).map { |locale| JSON.parse(Rails.root.join('app', 'javascript', 'mastodon', 'locales', "#{locale}.json").read) }.reduce(:merge)

  def submit_button
    I18n.t('generic.save_changes')
  end

  def success_message
    I18n.t('generic.changes_saved_msg')
  end

  def form_label(key)
    I18n.t key, scope: 'simple_form.labels'
  end

  def css_id(record)
    "##{dom_id(record)}"
  end

  def frontend_translations(key)
    FRONTEND_TRANSLATIONS[key]
  end

  def email_links(email)
    # 한국어 메일은 base64 로 실려 오므로 풀어서 본다(.to_s 는 인코딩된 그대로다).
    URI.extract(email.text_part.body.decoded, %w(http https))
  end
end
