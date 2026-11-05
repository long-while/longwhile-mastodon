# frozen_string_literal: true

require 'rails_helper'

RSpec.describe RemoveStatusService, :inline_jobs do
  subject { described_class.new }

  let!(:alice)  { Fabricate(:account) }
  let!(:bob)    { Fabricate(:account, username: 'bob', domain: 'example.com') }
  let!(:jeff)   { Fabricate(:account) }
  let!(:hank)   { Fabricate(:account, username: 'hank', protocol: :activitypub, domain: 'example.com', inbox_url: 'http://example.com/inbox') }
  let!(:bill)   { Fabricate(:account, username: 'bill', protocol: :activitypub, domain: 'example2.com', inbox_url: 'http://example2.com/inbox') }

  before do
    stub_request(:post, hank.inbox_url).to_return(status: 200)
    stub_request(:post, bill.inbox_url).to_return(status: 200)

    jeff.follow!(alice)
    hank.follow!(alice)
  end

  context 'when removed status is not a reblog' do
    let!(:media_attachment) { Fabricate(:media_attachment, account: alice) }
    let!(:status) { PostStatusService.new.call(alice, text: "Hello @#{bob.pretty_acct} ThisIsASecret", media_ids: [media_attachment.id]) }

    before do
      FavouriteService.new.call(jeff, status)
      Fabricate(:status, account: bill, reblog: status, uri: 'hoge')
    end

    # PostStatusService 가 만드는 글은 이 포크에서 언제나 private 라(943745d134) 공개 스트림
    # (public:media)에 나간 적이 없다. 그래서 거기로 삭제를 보내는 대신, 그 글을 받은
    # 팔로워의 스트림으로 삭제가 가는지와 공개 스트림에는 아무것도 안 나가는지를 본다.
    it 'removes status from notifications and from author and local follower home feeds, notifies follower streams but not public ones, sends delete activities' do
      allow(redis).to receive(:publish).with(any_args)

      expect { subject.call(status) }
        .to remove_status_from_notifications

      expect(home_feed_ids(alice))
        .to_not include(status.id)
      expect(home_feed_ids(jeff))
        .to_not include(status.id)

      expect(redis)
        .to have_received(:publish).with("timeline:#{jeff.id}", { event: :delete, payload: status.id.to_s }.to_json)
      expect(redis)
        .to_not have_received(:publish).with('timeline:public:media', anything)

      expect(delete_delivery(hank, status))
        .to have_been_made.once

      expect(delete_delivery(bill, status))
        .to have_been_made.once
    end

    def home_feed_ids(personage)
      HomeFeed
        .new(personage)
        .get(10)
        .pluck(:id)
    end

    def remove_status_from_notifications
      change { Notification.where(activity_type: 'Favourite', from_account: jeff, account: alice).count }
        .from(1)
        .to(0)
    end

    def delete_delivery(target, status)
      a_request(:post, target.inbox_url)
        .with(body: delete_activity_for(status))
    end

    def delete_activity_for(status)
      hash_including(
        'type' => 'Delete',
        'object' => {
          'type' => 'Tombstone',
          'id' => ActivityPub::TagManager.instance.uri_for(status),
          'atomUri' => OStatus::TagManager.instance.uri_for(status),
        }
      )
    end
  end

  context 'when removed status is a private self-reblog' do
    let!(:original_status) { Fabricate(:status, account: alice, text: 'Hello ThisIsASecret', visibility: :private) }
    let!(:status) { ReblogService.new.call(alice, original_status) }

    it 'sends Undo activity to followers' do
      subject.call(status)

      expect(undo_delivery(hank, original_status))
        .to have_been_made.once
    end
  end

  context 'when removed status is public self-reblog' do
    let!(:original_status) { Fabricate(:status, account: alice, text: 'Hello ThisIsASecret', visibility: :public) }
    let!(:status) { ReblogService.new.call(alice, original_status) }

    it 'sends Undo activity to followers' do
      subject.call(status)

      expect(undo_delivery(hank, original_status))
        .to have_been_made.once
    end
  end

  context 'when removed status is a reblog of a non-follower' do
    let!(:original_status) { Fabricate(:status, account: bill, text: 'Hello ThisIsASecret', visibility: :public) }
    let!(:status) { ReblogService.new.call(alice, original_status) }

    it 'sends Undo activity to followers' do
      subject.call(status)

      expect(undo_delivery(bill, original_status))
        .to have_been_made.once
    end
  end

  def undo_delivery(target, status)
    a_request(:post, target.inbox_url)
      .with(body: undo_activity_for(status))
  end

  def undo_activity_for(status)
    hash_including(
      'type' => 'Undo',
      'object' => hash_including(
        'type' => 'Announce',
        'object' => ActivityPub::TagManager.instance.uri_for(status)
      )
    )
  end

  context 'when removed status is a quote of a local user', inline_jobs: false do
    let(:original_status) { Fabricate(:status, account: alice) }
    let(:status) { Fabricate(:status, account: jeff) }

    before do
      bill.follow!(jeff)
      Fabricate(:quote, status: status, quoted_status: original_status, state: :accepted)
      original_status.discard
    end

    it 'sends deletion without crashing' do
      expect { subject.call(status.reload) }
        .to enqueue_sidekiq_job(ActivityPub::DeliveryWorker).with(/Delete/, jeff.id, bill.inbox_url)
    end
  end
end
