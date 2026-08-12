# frozen_string_literal: true

require 'rails_helper'

RSpec.describe PublishScheduledStatusWorker do
  subject { described_class.new }

  let(:scheduled_status) { Fabricate(:scheduled_status, params: { text: 'Hello world, future!' }) }

  # The record has to be built with a valid (future) time, so bring it due
  # afterwards without tripping the "must be in the future" validation.
  def make_due(record)
    record.update_column(:scheduled_at, 1.minute.ago)
  end

  describe 'perform' do
    context 'when the status is due' do
      before do
        make_due(scheduled_status)
        subject.perform(scheduled_status.id)
      end

      it 'creates a status and removes scheduled record' do
        expect(scheduled_status.account.statuses.first.text).to eq 'Hello world, future!'

        expect(ScheduledStatus.find_by(id: scheduled_status.id)).to be_nil
      end
    end

    context 'when the account is disabled' do
      let(:scheduled_status) { Fabricate(:scheduled_status, account: Fabricate(:account, user: Fabricate(:user, disabled: true))) }

      before do
        make_due(scheduled_status)
        subject.perform(scheduled_status.id)
      end

      it 'does not create a status and removes scheduled record' do
        expect(Status.count).to eq 0

        expect(ScheduledStatus.find_by(id: scheduled_status.id)).to be_nil
      end
    end

    context 'when the publication time is still in the future' do
      before do
        subject.perform(scheduled_status.id)
      end

      it 'discards the job and keeps the scheduled record', :aggregate_failures do
        expect(Status.count).to eq 0

        expect(ScheduledStatus.find_by(id: scheduled_status.id)).to_not be_nil
      end
    end

    context 'when another job already claimed the record' do
      before do
        make_due(scheduled_status)
        scheduled_status.claim_for_publishing!
        subject.perform(scheduled_status.id)
      end

      it 'does not publish it a second time', :aggregate_failures do
        expect(Status.count).to eq 0

        expect(ScheduledStatus.find_by(id: scheduled_status.id)).to_not be_nil
      end
    end

    context 'when publishing raises something unexpected' do
      let(:service) { instance_double(PostStatusService) }

      before do
        stub_const('PublishScheduledStatusWorkerSpecError', Class.new(StandardError))
        allow(PostStatusService).to receive(:new).and_return(service)
        allow(service).to receive(:call).and_raise(PublishScheduledStatusWorkerSpecError)
        make_due(scheduled_status)
      end

      it 'hands the claim back and lets Sidekiq retry', :aggregate_failures do
        expect { subject.perform(scheduled_status.id) }.to raise_error(PublishScheduledStatusWorkerSpecError)

        scheduled_status.reload
        # Holding the claim would make the retry bail out as "someone else is on
        # it", losing the post without a trace.
        expect(scheduled_status.publishing_at).to be_nil
        expect(scheduled_status.failed_at).to be_nil
      end
    end

    context 'when handing the post to PostStatusService' do
      let(:service) { instance_double(PostStatusService, call: nil) }

      before do
        allow(PostStatusService).to receive(:new).and_return(service)
        make_due(scheduled_status)
        subject.perform(scheduled_status.id)
      end

      it 'passes a deterministic idempotency key so a retry cannot double-post' do
        expect(service)
          .to have_received(:call)
          .with(scheduled_status.account, hash_including(idempotency: "scheduled:#{scheduled_status.id}"))
      end
    end

    context 'when the post it replies to is gone' do
      let(:scheduled_status) { Fabricate(:scheduled_status, params: { text: 'Hi', in_reply_to_id: 123_456_789 }) }

      before do
        make_due(scheduled_status)
        subject.perform(scheduled_status.id)
      end

      it 'records the failure instead of dropping it silently', :aggregate_failures do
        expect(Status.count).to eq 0

        scheduled_status.reload
        expect(scheduled_status.failed_at).to_not be_nil
        expect(scheduled_status.last_error).to be_present
      end
    end
  end
end
