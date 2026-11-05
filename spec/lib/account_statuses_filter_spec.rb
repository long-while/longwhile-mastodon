# frozen_string_literal: true

require 'rails_helper'

RSpec.describe AccountStatusesFilter do
  let(:account) { Fabricate(:account) }
  let(:current_account) { nil }
  let(:params) { {} }
  let(:reblogged_author) { Fabricate(:account) }

  def status!(visibility)
    Fabricate(:status, account: account, visibility: visibility)
  end

  def status_with_tag!(visibility, tag)
    Fabricate(:status, account: account, visibility: visibility, tags: [tag])
  end

  def status_with_parent!(visibility)
    Fabricate(:status, account: account, visibility: visibility, thread: Fabricate(:status))
  end

  def status_with_reblog!(visibility, reblogged_account = reblogged_author)
    Fabricate(:status, account: account, visibility: visibility, reblog: Fabricate(:status, account: reblogged_account))
  end

  def status_with_mention!(visibility, mentioned_account = nil)
    Fabricate(:status, account: account, visibility: visibility).tap do |status|
      Fabricate(:mention, status: status, account: mentioned_account || Fabricate(:account))
    end
  end

  def status_with_media_attachment!(visibility)
    Fabricate(:status, account: account, visibility: visibility).tap do |status|
      Fabricate(:media_attachment, account: account, status: status)
    end
  end

  describe '#results' do
    subject { described_class.new(account, current_account, params).results }

    let(:tag) { Fabricate(:tag) }

    before do
      status!(:public)
      status!(:unlisted)
      status!(:private)
      status_with_parent!(:public)
      status_with_reblog!(:public)
      status_with_tag!(:public, tag)
      status_with_mention!(:direct)
      status_with_media_attachment!(:public)
    end

    shared_examples 'filter params' do
      it 'respects param options in results' do
        expect(results_for(only_media: true))
          .to all(satisfy(&:with_media?))

        expect(results_for(tagged: tag.name))
          .to all(satisfy { |status| status.tags.include?(tag) })

        expect(results_for(exclude_replies: true))
          .to all(satisfy { |status| !status.reply? })

        expect(results_for(exclude_reblogs: true))
          .to all(satisfy { |status| !status.reblog? })

        expect(results_for(exclude_direct: true))
          .to all(satisfy { |status| !status.direct_visibility? })
      end

      def results_for(params)
        described_class
          .new(account, current_account, params)
          .results
      end
    end

    context 'when accessed anonymously' do
      let(:current_account) { nil }
      let(:direct_status) { nil }

      # 이 포크에서 미등재는 팔로워 전용이라 익명 방문자에게는 public 만 보인다
      # (AccountStatusesFilter#initial_scope 의 주석).
      context 'when rejecting direct messages' do
        let(:params) { { exclude_direct: true } }

        it 'returns only public statuses, replies, and reblogs' do
          expect(results_unique_visibilities).to match_array %w(public)

          expect(results_in_reply_to_ids).to_not be_empty

          expect(results_reblog_of_ids).to_not be_empty
        end
      end

      it 'returns only public statuses, public replies, and public reblogs' do
        expect(results_unique_visibilities).to match_array %w(public)

        expect(results_in_reply_to_ids).to_not be_empty

        expect(results_reblog_of_ids).to_not be_empty
      end

      # 프로필 API 는 늘 no_direct 를 넣는다. 그 스코프가 같은 visibility 컬럼을 건드려
      # merge! 가 "public 만" 조건을 지우고 private·unlisted 를 비로그인에게 내주던 것.
      %i(no_direct only_direct).each do |key|
        context "with #{key}" do
          let(:params) { { key => true } }

          it 'never returns more than public statuses' do
            expect(subject.pluck(:visibility).uniq - %w(public)).to be_empty
          end
        end
      end

      it_behaves_like 'filter params'
    end

    context 'when accessed with a blocked account' do
      let(:current_account) { Fabricate(:account) }

      before do
        account.block!(current_account)
      end

      context 'when rejecting direct messages' do
        let(:params) { { exclude_direct: true } }

        it 'returns nothing' do
          expect(subject.to_a).to be_empty
        end
      end

      it 'returns nothing' do
        expect(subject.to_a).to be_empty
      end
    end

    context 'when accessed by self' do
      let(:current_account) { account }

      it 'returns all statuses, replies, and reblogs' do
        expect(results_unique_visibilities).to match_array %w(direct private unlisted public)

        expect(results_in_reply_to_ids).to_not be_empty

        expect(results_reblog_of_ids).to_not be_empty
      end

      it_behaves_like 'filter params'
    end

    context 'when accessed by a follower' do
      let(:current_account) { Fabricate(:account) }

      # 부스트는 겹팔로워 전용이라(943745d134) 부스트된 글쓴이도 팔로우해야 보인다.
      before do
        current_account.follow!(account)
        current_account.follow!(reblogged_author)
      end

      context 'when rejecting direct messages' do
        let(:params) { { exclude_direct: true } }

        it 'returns private statuses, replies, and reblogs' do
          expect(results_unique_visibilities).to match_array %w(private unlisted public)

          expect(results_in_reply_to_ids).to_not be_empty

          expect(results_reblog_of_ids).to_not be_empty
        end
      end

      it 'returns private statuses, replies, and reblogs' do
        expect(results_unique_visibilities).to match_array %w(private unlisted public)

        expect(results_in_reply_to_ids).to_not be_empty

        expect(results_reblog_of_ids).to_not be_empty
      end

      context 'when there is a direct status mentioning the non-follower' do
        let!(:direct_status) { status_with_mention!(:direct, current_account) }

        it 'returns the direct status' do
          expect(results_ids).to include(direct_status.id)
        end

        it_behaves_like 'filter params'
      end

      it_behaves_like 'filter params'
    end

    # 이 포크에서 미등재는 팔로워 전용이고(initial_scope·filtered_scope 의 주석), 부스트는
    # 부스트된 글쓴이를 팔로우해야 보인다(943745d134). 그래서 부스트된 글쓴이는 팔로우한
    # 상태에서 원래 검사하려던 필터(차단·뮤트·도메인 차단)가 거르는지 본다.
    context 'when accessed by a non-follower' do
      let(:current_account) { Fabricate(:account) }

      before do
        current_account.follow!(reblogged_author)
      end

      context 'when rejecting direct messages' do
        let(:params) { { exclude_direct: true } }

        it 'returns only public statuses, replies, and reblogs' do
          expect(results_unique_visibilities).to match_array %w(public)

          expect(results_in_reply_to_ids).to_not be_empty

          expect(results_reblog_of_ids).to_not be_empty
        end
      end

      # 프로필 API 는 늘 no_direct 를 넣고(Api::V1::Accounts::StatusesController#filter_params),
      # exclude_direct 는 요청 파라미터로 그대로 들어온다. 둘이 겹치면 no_direct 의
      # where.not(visibility:) 가 exclude_direct 갈래의 visibility 조건을 merge! 로 지운다.
      context 'when the client also asks to exclude direct messages on the profile API' do
        let(:params) { { exclude_direct: true, no_direct: true } }

        it 'still returns only public statuses' do
          expect(results_unique_visibilities).to match_array %w(public)
        end
      end

      it 'returns only public statuses, replies, and reblogs' do
        expect(results_unique_visibilities).to match_array %w(public)

        expect(results_in_reply_to_ids).to_not be_empty

        expect(results_reblog_of_ids).to_not be_empty
      end

      context 'when the reblogged author is not followed' do
        let!(:reblog) { status_with_reblog!(:public, Fabricate(:account)) }

        it 'does not return the reblog' do
          expect(results_ids).to_not include(reblog.id)
        end
      end

      context 'when there is a private status mentioning the non-follower' do
        let!(:private_status) { status_with_mention!(:private, current_account) }

        it 'returns the private status' do
          expect(results_ids).to include(private_status.id)
        end

        it_behaves_like 'filter params'

        # 상류 4.7.4(#41019): exclude_direct 를 걸어도 나를 멘션한 팔로워 전용 글은 남는다.
        # 이 포크에서는 미등재도 팔로워 전용이라 같은 규칙을 받는다. 프로필 API 처럼 no_direct
        # 가 함께 와도(merge! 가 컬럼 조건을 지우는 함정) 결과가 같아야 한다.
        [{ exclude_direct: true }, { exclude_direct: true, no_direct: true }].each do |options|
          context "with #{options.keys.join(' and ')}" do
            let(:params) { options }
            let!(:unlisted_status) { status_with_mention!(:unlisted, current_account) }
            let!(:other_private_status) { status_with_mention!(:private) }
            let!(:other_unlisted_status) { status_with_mention!(:unlisted) }
            let!(:direct_status) { status_with_mention!(:direct, current_account) }

            it 'returns public statuses and the followers-only statuses mentioning the viewer, nothing else' do
              expect(results_ids).to include(private_status.id, unlisted_status.id)
              expect(results_ids).to_not include(other_private_status.id, other_unlisted_status.id, direct_status.id)
              expect(subject.reject { |status| [private_status.id, unlisted_status.id].include?(status.id) }.map(&:visibility).uniq).to eq %w(public)
            end
          end
        end
      end

      context 'when blocking a reblogged account' do
        let(:reblog) { status_with_reblog!('public') }

        before do
          current_account.block!(reblog.reblog.account)
        end

        it 'does not return reblog of blocked account' do
          expect(results_ids).to_not include(reblog.id)
        end
      end

      context 'when blocking a reblogged domain' do
        let(:other_account) { Fabricate(:account, domain: 'example.com') }
        let(:reblogging_status) { Fabricate(:status, account: other_account) }
        let!(:reblog) { Fabricate(:status, account: account, visibility: 'public', reblog: reblogging_status) }

        before do
          current_account.follow!(other_account)
          current_account.block_domain!(other_account.domain)
        end

        it 'does not return reblog of blocked domain' do
          expect(results_ids).to_not include(reblog.id)
        end
      end

      context 'when blocking an unrelated domain' do
        let(:other_account) { Fabricate(:account, domain: nil) }
        let(:reblogging_status) { Fabricate(:status, account: other_account, visibility: 'public') }
        let!(:reblog) { Fabricate(:status, account: account, visibility: 'public', reblog: reblogging_status) }

        before do
          current_account.follow!(other_account)
          current_account.block_domain!('example.com')
        end

        it 'returns the reblog from the non-blocked domain' do
          expect(results_ids).to include(reblog.id)
        end
      end

      context 'when blocking an unrelated domain and plucking ids from the relation' do
        let(:other_account) { Fabricate(:account, domain: nil) }
        let(:reblogging_status) { Fabricate(:status, account: other_account, visibility: 'public') }
        let!(:reblog) { Fabricate(:status, account: account, visibility: 'public', reblog: reblogging_status) }

        before do
          current_account.follow!(other_account)
          current_account.block_domain!('example.com')
        end

        it 'returns the reblog from the non-blocked domain' do
          expect(subject.pluck(:id)).to include(reblog.id)
        end
      end

      context 'when muting a reblogged account' do
        let(:reblog) { status_with_reblog!('public') }

        before do
          current_account.mute!(reblog.reblog.account)
        end

        it 'does not return reblog of muted account' do
          expect(results_ids).to_not include(reblog.id)
        end
      end

      context 'when blocked by a reblogged account' do
        let(:reblog) { status_with_reblog!('public') }

        before do
          reblog.reblog.account.block!(current_account)
        end

        it 'does not return reblog of blocked-by account' do
          expect(results_ids).to_not include(reblog.id)
        end
      end

      it_behaves_like 'filter params'
    end

    private

    def results_unique_visibilities
      subject.pluck(:visibility).uniq
    end

    # compact 한다 — nil 이 섞이면 `to_not be_empty` 가 답글·부스트가 하나도 없어도 통과한다.
    def results_in_reply_to_ids
      subject.pluck(:in_reply_to_id).compact
    end

    def results_reblog_of_ids
      subject.pluck(:reblog_of_id).compact
    end

    def results_ids
      subject.pluck(:id)
    end
  end
end
