# frozen_string_literal: true

require 'rails_helper'

RSpec.describe StatusCacheHydrator do
  let(:status)  { Fabricate(:status) }
  let(:account) { Fabricate(:account) }

  describe '#hydrate' do
    let(:compare_to_hash) { InlineRenderer.render(status, account, :status) }

    shared_examples 'shared behavior' do
      context 'when handling a new status' do
        let(:poll) { Fabricate(:poll) }
        let(:status) { Fabricate(:status, poll: poll) }

        it 'renders the same attributes as a full render' do
          expect(subject).to eql(compare_to_hash)
        end
      end

      context 'when handling a new status with a preview card with unverified account attribution' do
        let(:preview_card) { Fabricate(:preview_card, unverified_author_account: account) }

        before do
          PreviewCardsStatus.create(status: status, preview_card: preview_card)
        end

        it 'renders the same attributes as a full render' do
          expect(subject).to eql(compare_to_hash)
        end
      end

      context 'when handling a new status with own poll' do
        let(:poll) { Fabricate(:poll, account: account) }
        let(:status) { Fabricate(:status, poll: poll, account: account) }

        it 'renders the same attributes as a full render' do
          expect(subject).to eql(compare_to_hash)
        end
      end

      context 'when handling a status with a quote policy' do
        let(:status) { Fabricate(:status, quote_approval_policy: InteractionPolicy::POLICY_FLAGS[:followers] << 16) }

        before do
          account.follow!(status.account)
        end

        it 'renders the same attributes as a full render' do
          expect(subject).to eql(compare_to_hash)
        end
      end

      context 'when handling a filtered status' do
        let(:status) { Fabricate(:status, text: 'this toot is about that banned word') }

        before do
          account.custom_filters.create!(phrase: 'filter1', context: %w(home), action: :hide, keywords_attributes: [{ keyword: 'banned' }, { keyword: 'irrelevant' }])
        end

        it 'renders the same attributes as a full render' do
          expect(subject).to eql(compare_to_hash)
        end
      end

      # `replied` 는 포크가 더한 필드다. 캐시(비로그인 렌더)에는 없으므로 하이드레이터가 채워야 한다.
      context 'when the account has replied to the status' do
        before { Fabricate(:status, account: account, thread: status) }

        it 'renders the same attributes as a full render' do
          expect(subject).to eql(compare_to_hash)
          expect(subject[:replied]).to be true
        end
      end

      context 'when the account only has a deleted reply to the status' do
        before { Fabricate(:status, account: account, thread: status).discard }

        it 'renders the same attributes as a full render' do
          expect(subject).to eql(compare_to_hash)
          expect(subject[:replied]).to be false
        end
      end

      context 'when someone else has replied to the status' do
        before { Fabricate(:status, thread: status) }

        it 'renders the same attributes as a full render' do
          expect(subject).to eql(compare_to_hash)
          expect(subject[:replied]).to be false
        end
      end

      context 'when handling an unapproved quote' do
        let(:quoted_status) { Fabricate(:status) }

        before do
          Fabricate(:quote, status: status, quoted_status: quoted_status, state: :pending)
        end

        it 'renders the same attributes as full render' do
          expect(subject).to eql(compare_to_hash)
          expect(subject[:quote]).to_not be_nil
          expect(subject[:quote_status]).to be_nil
        end
      end

      context 'when handling an approved quote' do
        let(:quoted_status) { Fabricate(:status) }
        let(:legacy) { false }

        before do
          Fabricate(:quote, status: status, quoted_status: quoted_status, state: :accepted, legacy: legacy)
        end

        it 'renders the same attributes as full render' do
          expect(subject).to eql(compare_to_hash)
          expect(subject[:quote]).to_not be_nil
        end

        context 'when the quote post is recursive' do
          let(:quoted_status) { status }

          it 'renders the same attributes as full render' do
            expect(subject).to eql(compare_to_hash)
            expect(subject[:quote]).to_not be_nil
          end
        end

        context 'when the quote post is a legacy quote' do
          let(:legacy) { true }

          it 'renders the same attributes as full render' do
            expect(subject).to eql(compare_to_hash)
            expect(subject[:quote]).to_not be_nil
          end
        end

        context 'when the quoted post is a private post the viewer is not authorized to see' do
          let(:quoted_status) { Fabricate(:status, account: status.account, visibility: :private) }

          it 'renders the same attributes as full render' do
            expect(subject).to eql(compare_to_hash)
            expect(subject[:quote]).to_not be_nil
            expect(subject[:quote][:quoted_status]).to be_nil
          end
        end

        context 'when the quoted post is a private post the viewer is authorized to see' do
          let(:quoted_status) { Fabricate(:status, account: status.account, visibility: :private) }

          before do
            account.follow!(quoted_status.account)
          end

          it 'renders the same attributes as full render' do
            expect(subject).to eql(compare_to_hash)
            expect(subject[:quote]).to_not be_nil
            expect(subject[:quote][:quoted_status]).to_not be_nil
          end
        end

        context 'when the quoted post has been deleted' do
          let(:quoted_status) { nil }

          it 'returns the same attributes as full render' do
            expect(subject).to eql(compare_to_hash)
            expect(subject[:quote]).to_not be_nil
            expect(subject[:quote][:quoted_status]).to be_nil
          end
        end

        context 'when the quoted post author has blocked the viewer' do
          before do
            quoted_status.account.block!(account)
          end

          it 'returns the same attributes as full render' do
            expect(subject).to eql(compare_to_hash)
            expect(subject[:quote]).to_not be_nil
            expect(subject[:quote][:quoted_status]).to be_nil
          end
        end

        context 'when the viewer has blocked the quoted post author' do
          before do
            account.block!(quoted_status.account)
          end

          it 'returns the same attributes as full render' do
            expect(subject).to eql(compare_to_hash)
            expect(subject[:quote]).to_not be_nil
          end
        end

        context 'when the quoted post has been favourited' do
          before do
            FavouriteService.new.call(account, quoted_status)
          end

          it 'renders the same attributes as full render' do
            expect(subject).to eql(compare_to_hash)
            expect(subject[:quote]).to_not be_nil
          end
        end

        context 'when the quoted post has been reblogged' do
          before do
            ReblogService.new.call(account, quoted_status)
          end

          it 'renders the same attributes as full render' do
            expect(subject).to eql(compare_to_hash)
            expect(subject[:quote]).to_not be_nil
          end
        end

        context 'when the quoted post has a poll authored by the user' do
          let(:poll) { Fabricate(:poll, account: account) }
          let(:quoted_status) { Fabricate(:status, poll: poll, account: account) }

          it 'renders the same attributes as a full render' do
            expect(subject).to eql(compare_to_hash)
          end
        end

        context 'when the quoted post has been voted in' do
          let(:poll) { Fabricate(:poll, options: %w(Yellow Blue)) }
          let(:quoted_status) { Fabricate(:status, poll: poll) }

          before do
            VoteService.new.call(account, poll, [0])
          end

          it 'renders the same attributes as a full render' do
            expect(subject).to eql(compare_to_hash)
          end
        end

        context 'when the quoted post matches account filters' do
          let(:quoted_status) { Fabricate(:status, text: 'this toot is about that banned word') }

          before do
            account.custom_filters.create!(phrase: 'filter1', context: %w(home), action: :hide, keywords_attributes: [{ keyword: 'banned' }, { keyword: 'irrelevant' }])
          end

          it 'renders the same attributes as a full render' do
            expect(subject).to eql(compare_to_hash)
            expect(subject[:quote]).to_not be_nil
          end
        end

        context 'when the account has replied to the quoted post' do
          before { Fabricate(:status, account: account, thread: quoted_status) }

          it 'renders the same attributes as full render' do
            expect(subject).to eql(compare_to_hash)
            expect(subject[:replied]).to be false
            expect(subject.dig(:quote, :quoted_status, :replied)).to be true
          end
        end
      end

      context 'when handling a reblog' do
        let(:reblog) { Fabricate(:status) }
        let(:status) { Fabricate(:status, reblog: reblog) }

        context 'when the reblog has an approved quote' do
          let(:quoted_status) { Fabricate(:status) }

          before do
            Fabricate(:quote, status: reblog, quoted_status: quoted_status, state: :accepted)
          end

          it 'renders the same attributes as full render' do
            expect(subject).to eql(compare_to_hash)
            expect(subject[:reblog][:quote]).to_not be_nil
          end

          context 'when the quoted post has been favourited' do
            before do
              FavouriteService.new.call(account, quoted_status)
            end

            it 'renders the same attributes as full render' do
              expect(subject).to eql(compare_to_hash)
              expect(subject[:reblog][:quote]).to_not be_nil
            end
          end

          context 'when the quoted post has been reblogged' do
            before do
              ReblogService.new.call(account, quoted_status)
            end

            it 'renders the same attributes as full render' do
              expect(subject).to eql(compare_to_hash)
              expect(subject[:reblog][:quote]).to_not be_nil
            end
          end

          context 'when the quoted post matches account filters' do
            let(:quoted_status) { Fabricate(:status, text: 'this toot is about that banned word') }

            before do
              account.custom_filters.create!(phrase: 'filter1', context: %w(home), action: :hide, keywords_attributes: [{ keyword: 'banned' }, { keyword: 'irrelevant' }])
            end

            it 'renders the same attributes as a full render' do
              expect(subject).to eql(compare_to_hash)
              expect(subject[:reblog][:quote]).to_not be_nil
            end
          end
        end

        context 'when it has been favourited' do
          before do
            FavouriteService.new.call(account, reblog)
          end

          it 'renders the same attributes as a full render' do
            expect(subject).to eql(compare_to_hash)
          end
        end

        context 'when it has been reblogged' do
          before do
            ReblogService.new.call(account, reblog)
          end

          it 'renders the same attributes as a full render' do
            expect(subject).to eql(compare_to_hash)
          end
        end

        # 감싸는 쪽은 favourited 와 마찬가지로 원본의 값을 따른다(전체 렌더의 `object.proper.replies`).
        context 'when the account has replied to the reblogged status' do
          before { Fabricate(:status, account: account, thread: reblog) }

          it 'renders the same attributes as a full render' do
            expect(subject).to eql(compare_to_hash)
            expect(subject[:reblog][:replied]).to be true
            expect(subject[:replied]).to be true
          end
        end

        context 'when it has been pinned' do
          let(:reblog) { Fabricate(:status, account: account) }

          before do
            StatusPin.create!(account: account, status: reblog)
          end

          it 'renders the same attributes as a full render' do
            expect(subject).to eql(compare_to_hash)
          end
        end

        context 'when it has been followed tags' do
          let(:followed_tag) { Fabricate(:tag) }

          before do
            reblog.tags << Fabricate(:tag)
            reblog.tags << followed_tag
            TagFollow.create!(tag: followed_tag, account: account, rate_limit: false)
          end

          it 'renders the same attributes as a full render' do
            expect(subject).to eql(compare_to_hash)
          end
        end

        context 'when it has a poll authored by the user' do
          let(:poll) { Fabricate(:poll, account: account) }
          let(:reblog) { Fabricate(:status, poll: poll, account: account) }

          it 'renders the same attributes as a full render' do
            expect(subject).to eql(compare_to_hash)
          end
        end

        context 'when it has been voted in' do
          let(:poll) { Fabricate(:poll, options: %w(Yellow Blue)) }
          let(:reblog) { Fabricate(:status, poll: poll) }

          before do
            VoteService.new.call(account, poll, [0])
          end

          it 'renders the same attributes as a full render' do
            expect(subject).to eql(compare_to_hash)
          end
        end

        context 'when it matches account filters' do
          let(:reblog) { Fabricate(:status, text: 'this toot is about that banned word') }

          before do
            account.custom_filters.create!(phrase: 'filter1', context: %w(home), action: :hide, keywords_attributes: [{ keyword: 'banned' }, { keyword: 'irrelevant' }])
          end

          it 'renders the same attributes as a full render' do
            expect(subject).to eql(compare_to_hash)
          end
        end
      end
    end

    context 'when cache is warm' do
      subject do
        Rails.cache.write("fan-out/#{status.id}", InlineRenderer.render(status, nil, :status))
        described_class.new(status).hydrate(account.id)
      end

      it_behaves_like 'shared behavior'
    end

    context 'when cache is cold' do
      subject do
        Rails.cache.delete("fan-out/#{status.id}")
        described_class.new(status).hydrate(account.id)
      end

      it_behaves_like 'shared behavior'
    end
  end
end
