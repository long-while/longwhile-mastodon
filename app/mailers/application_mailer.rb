# frozen_string_literal: true

class ApplicationMailer < ActionMailer::Base
  layout 'mailer'

  helper :application
  helper :instance
  helper :formatting

  after_action :set_autoreply_headers!

  protected

  # @_longwhile — 메일도 화면(Localized)처럼 한국어로 고정한다. 받는 사람의 user.locale 은
  # 믿을 수 없다 — 64627430fe 부터 가입자가 en 으로 저장됐고, tootctl·API 가입은 비어 있으며
  # 비면 I18n.default_locale(DEFAULT_LOCALE 이 없으면 :en)로 떨어진다. 화면은 한국어인데
  # 로그인 보안 코드 같은 메일만 영어로 가게 된다.
  MAIL_LOCALE = :ko

  def locale_for_account(_account, &block)
    I18n.with_locale(MAIL_LOCALE, &block)
  end

  def set_autoreply_headers!
    headers(
      'Auto-Submitted' => 'auto-generated',
      'Precedence' => 'list',
      'X-Auto-Response-Suppress' => 'All'
    )
  end
end
