# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Web::PushNotificationWorker do
  subject { described_class.new }

  let(:endpoint) { 'https://updates.push.services.mozilla.com/push/v1/subscription-id' }
  let(:user) { Fabricate(:user) }
  let(:secret) { '아무에게도 말하지 마' }

  describe 'perform with a native FCM subscription' do
    let(:sender) { Fabricate(:account, username: 'alice', display_name: '앨리스') }
    let(:fcm_subscription) do
      Fabricate(:web_push_subscription,
                user: user,
                endpoint: "#{Fcm::MessageSender::ENDPOINT_PREFIX}device-token",
                data: { alerts: { mention: true, favourite: true } })
    end
    let(:message_sender) { instance_double(Fcm::MessageSender) }
    let(:sent_messages) { [] }

    before do
      allow(Fcm::MessageSender).to receive(:new).and_return(message_sender)
      allow(message_sender).to receive(:send_data_message) { |token, data| sent_messages << [token, data] }
    end

    def mention_notification(visibility, **status_attributes)
      status = Fabricate(:status, account: sender, visibility: visibility, text: secret, **status_attributes)
      mention = Fabricate(:mention, account: user.account, status: status)
      Fabricate(:notification, account: user.account, from_account: sender, activity: mention, type: :mention)
    end

    def sent_payload
      expect(sent_messages.size).to eq 1

      token, data = sent_messages.first
      expect(token).to eq 'device-token'
      JSON.parse(data[:payload])
    end

    it 'replaces the body of a direct message with a placeholder' do
      subject.perform(fcm_subscription.id, mention_notification(:direct).id)

      payload = sent_payload
      expect(payload['body']).to eq '새 메시지가 왔습니다'
      expect(payload.to_json).to_not include(secret)
      expect(payload).to include('notification_type' => 'mention', 'title' => include('앨리스'))
      expect(payload['notification_id']).to be_present
      expect(payload).to_not have_key('access_token')
    end

    it 'replaces the body and content warning of a followers-only post with a placeholder' do
      subject.perform(fcm_subscription.id, mention_notification(:private, spoiler_text: '스포일러 경고').id)

      payload = sent_payload
      expect(payload['body']).to eq '새 글이 있습니다'
      expect(payload.to_json).to_not include(secret, '스포일러 경고')
    end

    it 'hides a followers-only post of mine that someone favourited' do
      status = Fabricate(:status, account: user.account, visibility: :private, text: secret)
      favourite = Fabricate(:favourite, account: sender, status: status)
      notification = Fabricate(:notification, account: user.account, from_account: sender, activity: favourite, type: :favourite)

      subject.perform(fcm_subscription.id, notification.id)

      expect(sent_payload['body']).to eq '새 글이 있습니다'
    end

    it 'keeps the body of a public post' do
      subject.perform(fcm_subscription.id, mention_notification(:public).id)

      payload = sent_payload
      expect(payload['body']).to eq secret
      expect(payload).to_not have_key('access_token')
    end

    it 'leaves the encrypted standard Web Push payload of a direct message untouched' do
      browser_subscription = Fabricate(:web_push_subscription, user: user, endpoint: endpoint, data: { alerts: { mention: true } })
      encrypted_inputs = []
      allow(Webpush::Legacy::Encryption).to receive(:encrypt) do |json, *|
        encrypted_inputs << json
        { ciphertext: '', salt: 'salt', server_public_key: 'key' }
      end
      stub_request(:post, endpoint).to_return(status: 201, body: '')

      subject.perform(browser_subscription.id, mention_notification(:direct).id)

      expect(sent_messages).to be_empty
      expect(JSON.parse(encrypted_inputs.sole)).to include('body' => secret, 'access_token' => be_present)
    end
  end
end
