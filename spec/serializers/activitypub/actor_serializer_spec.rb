# frozen_string_literal: true

require 'rails_helper'

RSpec.describe ActivityPub::ActorSerializer do
  subject { serialized_record_json(record, described_class, adapter: ActivityPub::Adapter) }

  describe '#type' do
    context 'with the instance actor' do
      let(:record) { Account.find(Account::INSTANCE_ACTOR_ID) }

      it { is_expected.to include('type' => 'Application') }
    end

    context 'with an application actor' do
      let(:record) { Fabricate :account, actor_type: 'Application' }

      it { is_expected.to include('type' => 'Service') }
    end

    context 'with a service actor' do
      let(:record) { Fabricate :account, actor_type: 'Service' }

      it { is_expected.to include('type' => 'Service') }
    end

    context 'with a Group actor' do
      let(:record) { Fabricate :account, actor_type: 'Group' }

      it { is_expected.to include('type' => 'Group') }
    end

    context 'with a Person actor' do
      let(:record) { Fabricate :account, actor_type: 'Person' }

      it { is_expected.to include('type' => 'Person') }
    end
  end

  # header_exists? 조건이 빠져 헤더가 없어도·계정이 정지돼도 image 를 내보내던 것의 회귀 예제.
  # (기본 어댑터에서는 빈 Paperclip 첨부를 직렬화하다 터졌다.) 실제 응답과 같은 어댑터로 본다.
  describe '#image' do
    subject { serialized_record_json(record, described_class, adapter: ActivityPub::Adapter) }

    context 'without a header' do
      let(:record) { Fabricate :account }

      it { is_expected.to_not have_key('image') }
    end

    context 'with a header' do
      let(:record) { Fabricate :account, header: attachment_fixture('attachment.jpg') }

      it { is_expected.to include('image' => include('type' => 'Image', 'mediaType' => 'image/jpeg')) }
    end

    context 'with a header on a suspended account' do
      let(:record) { Fabricate :account, header: attachment_fixture('attachment.jpg'), suspended: true }

      it { is_expected.to_not have_key('image') }
    end
  end

  describe '#interactionPolicy' do
    let(:record) { Fabricate(:account) }

    context 'when actor is discoverable' do
      it 'includes an automatic policy allowing everyone' do
        expect(subject).to include('interactionPolicy' => {
          'canFeature' => {
            'automaticApproval' => ['https://www.w3.org/ns/activitystreams#Public'],
          },
        })
      end

      context 'when actor is locked' do
        let(:record) { Fabricate(:account, locked: true) }

        it 'includes an automatic policy allowing followers' do
          expect(subject).to include('interactionPolicy' => {
            'canFeature' => {
              'automaticApproval' => [ActivityPub::TagManager.instance.followers_uri_for(record)],
            },
          })
        end
      end
    end

    context 'when actor is not discoverable' do
      let(:record) { Fabricate(:account, discoverable: false) }

      it 'includes an automatic policy limited to the actor itself' do
        expect(subject).to include('interactionPolicy' => {
          'canFeature' => {
            'automaticApproval' => [ActivityPub::TagManager.instance.uri_for(record)],
          },
        })
      end
    end
  end

  describe 'avatar description' do
    let(:record) { Fabricate(:account, avatar: attachment_fixture('avatar.gif'), avatar_description: 'test') }

    it 'includes an `icon` with the appropraite `summary`' do
      expect(subject).to include('icon' => a_hash_including(
        'summary' => 'test'
      ))
    end
  end
end
