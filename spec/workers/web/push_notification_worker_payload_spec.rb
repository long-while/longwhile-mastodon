# frozen_string_literal: true

require 'rails_helper'

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
