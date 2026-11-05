# frozen_string_literal: true

# 이 포크는 메일을 받는 사람의 locale 과 무관하게 한국어로 보낸다(ApplicationMailer::MAIL_LOCALE).
# 저장된 locale 이 en 이거나 비어 있는 사용자가 많아(가입이 en 을 적던 시기, tootctl·API 가입)
# 화면은 한국어인데 로그인 보안 코드 같은 메일만 영어로 가던 것을 막는다.
RSpec.shared_examples 'localized subject' do |*args, **kwrest|
  it 'renders subject in Korean even if the receiver chose another locale' do
    receiver.update!(locale: :de)
    expect(mail.subject).to eq I18n.t(*args, **kwrest.merge(locale: :ko))
  end

  it 'renders subject in Korean if the receiver has no locale' do
    receiver.update!(locale: nil)
    expect(mail.subject).to eq I18n.t(*args, **kwrest.merge(locale: :ko))
  end
end

RSpec::Matchers.define :have_thread_headers do
  match(notify_expectation_failures: true) do |mail|
    expect(mail)
      .to be_present
      .and have_header('In-Reply-To', conversation_header_regex)
      .and have_header('References', conversation_header_regex)
  end

  def conversation_header_regex = /<conversation-\d+.\d\d\d\d-\d\d-\d\d@#{Regexp.quote(Rails.configuration.x.local_domain)}>/
end

RSpec::Matchers.define :have_standard_headers do |type|
  chain :for do |user|
    @user = user
  end

  match(notify_expectation_failures: true) do |mail|
    expect(mail)
      .to be_present
      .and have_header('To', "#{@user.account.username} <#{@user.email}>")
      .and have_header('List-ID', "<#{type}.#{@user.account.username}.#{Rails.configuration.x.local_domain}>")
      .and have_header('List-Unsubscribe', %r{<https://#{Rails.configuration.x.local_domain}/unsubscribe\?token=.+>})
      .and have_header('List-Unsubscribe', /&type=#{type}/)
      .and have_header('List-Unsubscribe-Post', 'List-Unsubscribe=One-Click')
    expect(mail.to)
      .to contain_exactly(@user.email)
    expect(mail.from)
      .to contain_exactly(Rails.configuration.action_mailer.default_options[:from])
  end
end

RSpec::Matchers.define :have_header do |name, value|
  match(notify_expectation_failures: true) do |mail|
    expect(mail.header[name].value)
      .to match(value)
  end
end
