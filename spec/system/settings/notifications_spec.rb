# frozen_string_literal: true

require 'rails_helper'

# @_longwhile — 개인 메일 알림 다섯을 걷어냈다 (SMTP 가 없어 켜도 아무 일이
# 일어나지 않는 설정이었다). 일반 사용자에게 이 화면에 남는 것은 알림 정책
# 셋뿐이고, user[...] 필드가 하나도 없는 폼이 된다 — 저장이 그래도 되는지가
# 이 스펙의 핵심이다.
RSpec.describe 'Settings notifications page' do
  let(:user) { Fabricate :user }

  before { sign_in user }

  it 'Views the page' do
    visit settings_notifications_path

    expect(page)
      .to have_private_cache_control
      .and have_title(I18n.t('settings.notifications'))
  end

  it 'Saves the notification policy even though the form has no user fields' do
    visit settings_notifications_path

    select I18n.t('simple_form.labels.notification_policy.policies.drop'), from: not_following_field

    expect { click_on submit_button }
      .to change { NotificationPolicy.find_by(account: user.account)&.for_not_following }.to('drop')
    expect(page)
      .to have_title(I18n.t('settings.notifications'))
  end

  def not_following_field
    I18n.t('simple_form.labels.notification_policy.for_not_following')
  end
end
