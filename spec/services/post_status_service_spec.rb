# frozen_string_literal: true

require 'rails_helper'

RSpec.describe PostStatusService do
  subject { described_class.new }

  it 'creates a new status' do
    account = Fabricate(:account)
    text = 'test status update'

    status = subject.call(account, text: text)

    expect(status).to be_persisted
    expect(status.text).to eq text
  end

  it 'creates a new response status' do
    in_reply_to_status = Fabricate(:status)
    account = Fabricate(:account)
    text = 'test status update'

    status = subject.call(account, text: text, thread: in_reply_to_status)

    expect(status).to be_persisted
    expect(status.text).to eq text
    expect(status.thread).to eq in_reply_to_status
  end

  context 'when scheduling a status' do
    let!(:account)         { Fabricate(:account) }
    let!(:future)          { Time.now.utc + 2.hours }
    let!(:previous_status) { Fabricate(:status, account: account) }

    it 'schedules a status for future creation and does not create one immediately' do
      media = Fabricate(:media_attachment, account: account)
      status = subject.call(account, text: 'Hi future!', media_ids: [media.id.to_s], scheduled_at: future)

      expect(status)
        .to be_a(ScheduledStatus)
        .and have_attributes(
          scheduled_at: eq(future),
          params: include(
            'text' => eq('Hi future!'),
            'media_ids' => contain_exactly(media.id.to_s)
          )
        )
      expect(media.reload.status).to be_nil
      expect(Status.where(text: 'Hi future!')).to_not exist
    end

    it 'does not change statuses_count of account or replies_count of thread previous status' do
      expect { subject.call(account, text: 'Hi future!', scheduled_at: future, thread: previous_status) }
        .to not_change { account.statuses_count }
        .and(not_change { previous_status.replies_count })
    end

    it 'returns existing status when used twice with idempotency key' do
      account = Fabricate(:account)
      status1 = described_class.new.call(account, text: 'test', idempotency: 'meepmeep', scheduled_at: future)
      status2 = described_class.new.call(account, text: 'test', idempotency: 'meepmeep', scheduled_at: future)
      expect(status2.id).to eq status1.id
    end

    context 'when scheduled_at is less than min offset' do
      let(:invalid_scheduled_time) { (ScheduledStatus::MINIMUM_OFFSET - 1.second).from_now }

      it 'raises invalid record error' do
        expect do
          subject.call(account, text: 'Hi future!', scheduled_at: invalid_scheduled_time)
        end.to raise_error(
          ActiveRecord::RecordInvalid,
          'Validation failed: Scheduled at date must be in the future'
        )
      end
    end
  end

  it 'creates response to the original status of boost' do
    boosted_status = Fabricate(:status)
    in_reply_to_status = Fabricate(:status, reblog: boosted_status)
    account = Fabricate(:account)
    text = 'test status update'

    status = subject.call(account, text: text, thread: in_reply_to_status)

    expect(status).to be_persisted
    expect(status.text).to eq text
    expect(status.thread).to eq boosted_status
  end

  it 'creates a sensitive status' do
    status = create_status_with_options(sensitive: true)

    expect(status).to be_persisted
    expect(status).to be_sensitive
  end

  it 'creates a status with spoiler text' do
    spoiler_text = 'spoiler text'

    status = create_status_with_options(spoiler_text: spoiler_text)

    expect(status).to be_persisted
    expect(status.spoiler_text).to eq spoiler_text
  end

  it 'creates a sensitive status when there is a CW but no text' do
    status = subject.call(Fabricate(:account), text: '', spoiler_text: 'foo')

    expect(status).to be_persisted
    expect(status).to be_sensitive
  end

  it 'creates a status with empty default spoiler text' do
    status = create_status_with_options(spoiler_text: nil)

    expect(status).to be_persisted
    expect(status.spoiler_text).to eq ''
  end

  it 'creates a status with the given visibility' do
    status = create_status_with_options(visibility: :private)

    expect(status).to be_persisted
    expect(status.visibility).to eq 'private'
  end

  # 이 포크는 클라이언트가 보낸 공개 범위가 private·direct(공지 계정은 unlisted 까지)가
  # 아니면 오류 대신 private 로 내린다(PostStatusService#permitted_visibility?, 943745d134).
  it 'coerces an invalid visibility to private' do
    status = create_status_with_options(visibility: :xxx)

    expect(status).to be_persisted
    expect(status.visibility).to eq 'private'
  end

  it 'creates a status with limited visibility for silenced users' do
    status = subject.call(Fabricate(:account, silenced: true), text: 'test', visibility: :public)

    expect(status).to be_persisted
    expect(status.visibility).to eq 'private'
  end

  it 'creates a status for the given application' do
    application = Fabricate(:application)

    status = create_status_with_options(application: application)

    expect(status).to be_persisted
    expect(status.application).to eq application
  end

  it 'creates a status with a language set' do
    account = Fabricate(:account)
    text = 'This is an English text.'

    status = subject.call(account, text: text)

    expect(status.language).to eq 'en'
  end

  # 이 포크에서 인용 정책이 살아남는 것은 공지 계정의 unlisted 글뿐이다. 다른 글은 모두 private 로
  # 올라가고, 업스트림이 private 글의 정책을 nobody 로 내린다(downgrade_quote_policy).
  it 'creates a status with the quote approval policy set' do
    # 예약된 아이디라 검증을 건너뛰고 만든다(운영에서는 관리자가 만든 계정이다).
    announcer = Fabricate.build(:account, username: PublicFeed::ANNOUNCEMENT_USERNAME).tap { |a| a.save!(validate: false) }
    status = subject.call(announcer, text: 'test', visibility: 'unlisted', quote_approval_policy: InteractionPolicy::POLICY_FLAGS[:followers] << 16)

    expect(status.quote_approval_policy).to eq(InteractionPolicy::POLICY_FLAGS[:followers] << 16)
  end

  it 'drops the quote approval policy of a private status' do
    status = create_status_with_options(quote_approval_policy: InteractionPolicy::POLICY_FLAGS[:followers] << 16)

    expect(status).to be_private_visibility
    expect(status.quote_approval_policy).to eq(0)
  end

  it 'processes mentions' do
    mention_service = instance_double(ProcessMentionsService)
    allow(mention_service).to receive(:call)
    allow(ProcessMentionsService).to receive(:new).and_return(mention_service)
    account = Fabricate(:account)

    status = subject.call(account, text: 'test status update')

    expect(ProcessMentionsService).to have_received(:new)
    expect(mention_service).to have_received(:call).with(status)
  end

  it 'safeguards mentions' do
    account = Fabricate(:account)
    mentioned_account = Fabricate(:account, username: 'alice')
    unexpected_mentioned_account = Fabricate(:account, username: 'bob')

    expect do
      subject.call(account, text: '@alice hm, @bob is really annoying lately', allowed_mentions: [mentioned_account.id])
    end.to raise_error(an_instance_of(described_class::UnexpectedMentionsError).and(having_attributes(accounts: [unexpected_mentioned_account])))
  end

  it 'processes duplicate mentions correctly' do
    account = Fabricate(:account)
    Fabricate(:account, username: 'alice')

    expect do
      subject.call(account, text: '@alice @alice @alice hey @alice')
    end.to_not raise_error
  end

  it 'processes hashtags' do
    hashtags_service = instance_double(ProcessHashtagsService)
    allow(hashtags_service).to receive(:call)
    allow(ProcessHashtagsService).to receive(:new).and_return(hashtags_service)
    account = Fabricate(:account)

    status = subject.call(account, text: 'test status update')

    expect(ProcessHashtagsService).to have_received(:new)
    expect(hashtags_service).to have_received(:call).with(status)
  end

  it 'processes tagged objects' do
    account = Fabricate(:account)
    collection = Fabricate(:collection)

    status = subject.call(account, text: "test #{ActivityPub::TagManager.instance.uri_for(collection)} #{ActivityPub::TagManager.instance.uri_for(collection)}")

    expect(status.tagged_objects.map(&:object))
      .to contain_exactly(collection)
  end

  it 'gets distributed' do
    allow(DistributionWorker).to receive(:perform_async)
    allow(ActivityPub::DistributionWorker).to receive(:perform_async)

    account = Fabricate(:account)

    status = subject.call(account, text: 'test status update')

    expect(DistributionWorker).to have_received(:perform_async).with(status.id)
    expect(ActivityPub::DistributionWorker).to have_received(:perform_async).with(status.id)
  end

  it 'crawls links' do
    allow(LinkCrawlWorker).to receive(:perform_async)
    account = Fabricate(:account)

    status = subject.call(account, text: 'test status update')

    expect(LinkCrawlWorker).to have_received(:perform_async).with(status.id)
  end

  it 'attaches the given media to the created status' do
    account = Fabricate(:account)
    media = Fabricate(:media_attachment, account: account)

    status = subject.call(
      account,
      text: 'test status update',
      media_ids: [media.id.to_s]
    )

    expect(media.reload.status).to eq status
  end

  it 'does not attach media from another account to the created status' do
    account = Fabricate(:account)
    media = Fabricate(:media_attachment, account: Fabricate(:account))

    expect do
      subject.call(
        account,
        text: 'test status update',
        media_ids: [media.id.to_s]
      )
    end.to raise_error(
      Mastodon::ValidationError,
      I18n.t('media_attachments.validations.not_found', ids: media.id)
    )
  end

  it 'does not allow attaching more files than configured limit' do
    stub_const('Status::MEDIA_ATTACHMENTS_LIMIT', 1)
    account = Fabricate(:account)

    expect do
      subject.call(
        account,
        text: 'test status update',
        media_ids: Array.new(2) { Fabricate(:media_attachment, account: account) }.map { |m| m.id.to_s }
      )
    end.to raise_error(
      Mastodon::ValidationError,
      I18n.t('media_attachments.validations.too_many')
    )
  end

  it 'does not allow attaching both videos and images' do
    account = Fabricate(:account)
    video   = Fabricate(:media_attachment, type: :video, account: account)
    image   = Fabricate(:media_attachment, type: :image, account: account)

    video.update(type: :video)

    expect do
      subject.call(
        account,
        text: 'test status update',
        media_ids: [
          video,
          image,
        ].map { |m| m.id.to_s }
      )
    end.to raise_error(
      Mastodon::ValidationError,
      I18n.t('media_attachments.validations.images_and_video')
    )
  end

  it 'correctly requests a quote for remote posts' do
    account = Fabricate(:account)
    quoted_status = Fabricate(:status, account: Fabricate(:account, domain: 'example.com'))

    expect { subject.call(account, text: 'test', quoted_status: quoted_status) }
      .to enqueue_sidekiq_job(ActivityPub::QuoteRequestWorker)
  end

  it 'allows quotes with spoilers and no text' do
    account = Fabricate(:account)
    quoted_status = Fabricate(:status, account: Fabricate(:account, domain: 'example.com'))

    expect { subject.call(account, spoiler_text: 'test', quoted_status: quoted_status) }
      .to enqueue_sidekiq_job(ActivityPub::QuoteRequestWorker)
  end

  it 'correctly downgrades visibility for private self-quotes' do
    account = Fabricate(:account)
    quoted_status = Fabricate(:status, account: account, visibility: :private)

    status = subject.call(account, text: 'test', quoted_status: quoted_status)
    expect(status).to be_private_visibility
  end

  it 'correctly preserves visibility for private mentions self-quoting private posts' do
    account = Fabricate(:account)
    quoted_status = Fabricate(:status, account: account, visibility: :private)

    status = subject.call(account, text: 'test', quoted_status: quoted_status, visibility: 'direct')
    expect(status).to be_direct_visibility
  end

  it 'returns existing status when used twice with idempotency key' do
    account = Fabricate(:account)
    status1 = described_class.new.call(account, text: 'test', idempotency: 'meepmeep')
    status2 = described_class.new.call(account, text: 'test', idempotency: 'meepmeep')
    expect(status2.id).to eq status1.id
  end

  # @_longwhile — DM 채팅. 답글은 부모의 conversation 을 물려받는데, 그것이 다른
  #   방의 것이면 메시지가 그 방으로 새고 이 방은 비어 버린다. (DmRoom.thread_accepts?)
  context 'when replying with a direct message into another room\'s thread' do
    # let! — 멘션은 본문의 @이름 으로 찾으므로, 서비스를 부르기 전에 계정이 있어야 한다.
    let!(:alice) { Fabricate(:account, username: 'alice') }
    let!(:bob)   { Fabricate(:account, username: 'bob') }

    before do
      Fabricate(:account, username: 'carol')
      allow(Mastodon::DmChat).to receive(:enabled?).and_return(true)
    end

    it 'starts a separate conversation when the participants differ' do
      group_root = subject.call(alice, text: '@bob @carol hi', visibility: 'direct')
      reply      = subject.call(alice, text: '@bob just you', visibility: 'direct', thread: group_root)

      expect(reply.conversation_id).to_not eq group_root.conversation_id
      expect(reply.in_reply_to_id).to eq group_root.id
      expect(DmRoom.find_by(participant_key: DmRoom.participant_key_for([alice.id, bob.id])).visible_statuses_for(bob).pluck(:id)).to eq [reply.id]
    end

    it 'stays in the thread when the participants are the same' do
      root  = subject.call(alice, text: '@bob hi', visibility: 'direct')
      reply = subject.call(bob, text: '@alice hello', visibility: 'direct', thread: root)

      expect(reply.conversation_id).to eq root.conversation_id
    end

    # 웹 채팅은 최근 메시지에 답글을 단다(2026-11). 사슬이 길어져도 한 conversation 이다.
    it 'stays in the thread when each message replies to the latest one' do
      root   = subject.call(alice, text: '@bob 1', visibility: 'direct')
      second = subject.call(bob, text: '@alice 2', visibility: 'direct', thread: root)
      third  = subject.call(alice, text: '@bob 3', visibility: 'direct', thread: second)
      room   = DmRoom.find_by(participant_key: DmRoom.participant_key_for([alice.id, bob.id]))

      expect([second, third].map(&:conversation_id)).to all(eq root.conversation_id)
      expect(third.in_reply_to_id).to eq second.id
      expect(room.reload.root_status_id).to eq root.id
      expect(room.visible_statuses_for(bob).pluck(:id)).to contain_exactly(root.id, second.id, third.id)
    end

    it 'leaves non-direct replies alone' do
      group_root = subject.call(alice, text: '@bob @carol hi', visibility: 'direct')
      reply      = subject.call(alice, text: 'followers', visibility: 'private', thread: group_root)

      expect(reply.conversation_id).to eq group_root.conversation_id
    end

    # 익명화(글 남기고 탈퇴)된 멤버는 방 JSON 에 acct `deleted` 로 나가고, 화면이 붙여 보내는
    # `@deleted` 는 해석되지 않는다. 그 멤버를 뺀 명단도 같은 방으로 받아야 방이 안 쪼개진다.
    context 'when a member of the group room has been anonymised' do
      let!(:mark) { Fabricate(:account, username: 'mark') }
      let!(:group_root) { subject.call(alice, text: '@bob @carol hi', visibility: 'direct') }
      let(:group_room)  { DmRoom.find_by(participant_key: DmRoom.participant_key_for([alice.id, bob.id, Account.find_by(username: 'carol').id])) }

      before { Account.find_by(username: 'carol').update!(anonymized_at: Time.now.utc) }

      it 'keeps what the remaining members send in the same room', :aggregate_failures do
        reply  = subject.call(bob, text: '@alice @deleted still here', visibility: 'direct', thread: group_root)
        answer = subject.call(alice, text: '@bob @deleted yes', visibility: 'direct', thread: reply)

        expect([reply, answer].map(&:conversation_id).uniq).to eq [group_root.conversation_id]
        expect(DmRoom.count).to eq 1
        expect(group_room.reload.last_status_id).to eq answer.id
        expect(group_room.visible_statuses_for(bob).pluck(:id)).to include(reply.id, answer.id)
      end

      it 'still starts a separate room when the participants really differ' do
        reply = subject.call(alice, text: '@mark elsewhere', visibility: 'direct', thread: group_root)

        expect(reply.conversation_id).to_not eq group_root.conversation_id
        expect(DmRoom.find_by(participant_key: DmRoom.participant_key_for([alice.id, mark.id])).visible_statuses_for(mark).pluck(:id)).to eq [reply.id]
      end
    end
  end

  def create_status_with_options(**options)
    subject.call(Fabricate(:account), options.merge(text: 'test'))
  end
end
