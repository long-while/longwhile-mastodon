# frozen_string_literal: true

require 'rails_helper'

# @_longwhile — 브라우저 웹 푸시의 평문 페이로드와 고정된 서비스 워커의 계약.
#
#   service_worker/web_push_notifications.js 의 handlePush 는 페이로드에서
#   access_token · notification_id · preferred_locale · title · body · icon 을 꺼낸다.
#   access_token 으로 /api/v1/notifications/:id 를 다시 읽어 제목·본문·눌렀을 때 갈
#   주소를 만들고, 알림의 "부스트"·"좋아요" 단추도 그 토큰으로 보낸다. 실패하면
#   title·body 로 대신 띄운다.
#
#   결정 C 로 앱(FCM) 푸시에서는 access_token 을 뺐다(구글을 거치므로). 같은 정리를
#   브라우저 푸시에 하면 알림은 뜨지만 눌러도 엉뚱한 곳으로 가고 단추가 죽는다.
#   브라우저 푸시는 종단 간 암호화(aes128gcm/aesgcm)라 토큰이 중간에 보이지 않는다.
RSpec.describe Web::PushNotificationWorker do
  let(:user)         { Fabricate(:user) }
  let(:sender)       { Fabricate(:account, display_name: '보낸이') }
  let(:status)       { Fabricate(:status, account: sender, text: '본문') }
  let(:mention)      { Fabricate(:mention, account: user.account, status: status) }
  let(:notification) { Fabricate(:notification, account: user.account, activity: mention, type: :mention) }
  let(:access_token) { Fabricate(:accessible_access_token, resource_owner_id: user.id, scopes: 'read write follow push') }

  let(:subscription) do
    Fabricate(:web_push_subscription, user: user, access_token: access_token, standard: true,
                                      endpoint: 'https://updates.push.services.mozilla.com/push/v1/subscription-id',
                                      key_p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
                                      key_auth: 'BTBZMqHH6r4Tts7J_aSIgg',
                                      data: { policy: 'all', alerts: { mention: true } })
  end

  it 'sends the service worker everything handlePush reads, including the access token' do
    plaintext = nil
    allow_any_instance_of(WebPushRequest).to receive(:standard_encrypt) do |_request, payload| # rubocop:disable RSpec/AnyInstance
      plaintext = payload
      'ciphertext'
    end
    stub_request(:post, subscription.endpoint).to_return(status: 201)

    described_class.new.perform(subscription.id, notification.id)

    payload = JSON.parse(plaintext)
    expect(payload).to include(
      'access_token' => access_token.token,
      'notification_id' => notification.id,
      'preferred_locale' => be_present,
      'title' => include('보낸이'),
      'body' => '본문',
      'icon' => be_present
    )
  end
end
