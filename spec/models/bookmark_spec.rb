# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Bookmark do
  describe 'Associations' do
    it { is_expected.to belong_to(:account).required }
    it { is_expected.to belong_to(:status).required }
  end

  describe 'Validations' do
    subject { Fabricate.build :bookmark }

    it { is_expected.to validate_uniqueness_of(:status_id).scoped_to(:account_id) }
  end

  describe 'Callbacks' do
    describe 'reblog statuses' do
      context 'when status is not a reblog' do
        let(:status) { Fabricate :status }

        it 'keeps status set to assigned value' do
          bookmark = Fabricate.build :bookmark, status: status

          expect { bookmark.valid? }
            .to_not change(bookmark, :status)
        end
      end

      context 'when status is a reblog' do
        let(:original) { Fabricate :status }
        let(:status) { Fabricate :status, reblog: original }

        it 'keeps status set to assigned value' do
          bookmark = Fabricate.build :bookmark, status: status

          expect { bookmark.valid? }
            .to change(bookmark, :status).to(original)
        end
      end
    end
  end

  describe 'note' do
    let(:bookmark) { Fabricate(:bookmark) }

    it 'trims the edges and stores nil when nothing is left', :aggregate_failures do
      bookmark.update!(note: "\u3000 메모 \u200B")
      expect(bookmark.reload.note).to eq '메모'

      bookmark.update!(note: " \u00A0 ")
      expect(bookmark.reload.note).to be_nil
    end

    it 'allows up to 500 characters', :aggregate_failures do
      bookmark.note = 'a' * 500
      expect(bookmark).to be_valid

      bookmark.note = 'a' * 501
      expect(bookmark).to_not be_valid
      expect(bookmark.errors[:base]).to eq [I18n.t('bookmarks.errors.note_too_long', limit: 500)]
    end
  end
end
