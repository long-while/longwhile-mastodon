# frozen_string_literal: true

require 'rails_helper'

RSpec.describe UpdateScheduledStatusService do
  subject { described_class.new }

  let(:account) { Fabricate(:account) }
  let(:stored_params) do
    {
      'text' => 'before',
      'spoiler_text' => '',
      'sensitive' => false,
      'visibility' => 'private',
      'language' => 'en',
    }
  end
  let(:scheduled_status) { Fabricate(:scheduled_status, account: account, params: stored_params) }

  describe 'moving it in time' do
    it 'keeps the record and its body' do
      new_time = 30.hours.from_now

      subject.call(scheduled_status, scheduled_at: new_time)

      scheduled_status.reload
      expect(scheduled_status.scheduled_at).to be_within(1.second).of(new_time)
      expect(scheduled_status.params['text']).to eq 'before'
    end
  end

  describe 'rewriting the body' do
    it 'replaces only the keys given', :aggregate_failures do
      subject.call(scheduled_status, text: 'after', spoiler_text: 'heads up')

      scheduled_status.reload
      expect(scheduled_status.params['text']).to eq 'after'
      expect(scheduled_status.params['spoiler_text']).to eq 'heads up'
      expect(scheduled_status.params['visibility']).to eq 'private'
    end

    it 'rejects a body the Status model would refuse' do
      expect { subject.call(scheduled_status, text: 'x' * 10_000) }
        .to raise_error(ActiveRecord::RecordInvalid)
    end

    it 'leaves the record untouched when the new body is invalid' do
      expect { subject.call(scheduled_status, text: 'x' * 10_000) }.to raise_error(ActiveRecord::RecordInvalid)

      expect(scheduled_status.reload.params['text']).to eq 'before'
    end
  end

  describe 'removing a poll' do
    let(:stored_params) do
      {
        'text' => 'pick one',
        'visibility' => 'public',
        'poll' => { 'options' => %w(a b), 'expires_in' => 3600, 'multiple' => false },
      }
    end

    it 'clears it when the key is sent as nil' do
      subject.call(scheduled_status, poll: nil)

      expect(scheduled_status.reload.params['poll']).to be_nil
    end

    it 'keeps it when the key is not sent' do
      subject.call(scheduled_status, text: 'pick one, please')

      expect(scheduled_status.reload.params['poll']).to be_present
    end
  end

  describe 'attachments' do
    let(:stored_params) { { 'text' => '', 'visibility' => 'public' } }
    let!(:media) { Fabricate(:media_attachment, account: account, status: nil) }

    before do
      media.update(scheduled_status_id: scheduled_status.id)
    end

    it 'detaches everything when an empty list is sent', :aggregate_failures do
      subject.call(scheduled_status, text: 'now with words', media_ids: [])

      expect(scheduled_status.reload.params['media_ids']).to eq []
      expect(media.reload.scheduled_status_id).to be_nil
    end

    it 'keeps the ones still listed', :aggregate_failures do
      subject.call(scheduled_status, media_ids: [media.id.to_s])

      expect(scheduled_status.reload.params['media_ids']).to eq [media.id]
      expect(media.reload.scheduled_status_id).to eq scheduled_status.id
    end
  end

  describe 'a record that previously failed' do
    before do
      scheduled_status.record_failure!('boom')
    end

    it 'clears the failure so it is queued again', :aggregate_failures do
      subject.call(scheduled_status, scheduled_at: 30.hours.from_now)

      scheduled_status.reload
      expect(scheduled_status.failed_at).to be_nil
      expect(scheduled_status.last_error).to be_nil
      expect(scheduled_status.publishing_at).to be_nil
    end
  end

  describe 'a record that is being published right now' do
    before do
      scheduled_status.claim_for_publishing!
    end

    it 'refuses the change rather than losing it' do
      expect { subject.call(scheduled_status, text: 'too late') }
        .to raise_error(Mastodon::ValidationError)
    end
  end

  describe 'a record whose claim went stale' do
    before do
      scheduled_status.update_column(:publishing_at, (ScheduledStatus::STALE_CLAIM_AFTER + 1.minute).ago)
    end

    it 'allows the change, so a stuck post can be rescued' do
      expect { subject.call(scheduled_status, scheduled_at: 30.hours.from_now) }
        .to_not raise_error
    end
  end
end
