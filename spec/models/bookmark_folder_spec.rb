# frozen_string_literal: true

require 'rails_helper'

RSpec.describe BookmarkFolder do
  let(:account) { Fabricate(:account) }

  describe 'validations' do
    it 'requires a name of at most 30 characters' do
      expect(described_class.new(account: account, name: '')).to_not be_valid
      expect(described_class.new(account: account, name: 'a' * 31)).to_not be_valid
      expect(described_class.new(account: account, name: 'a' * 30)).to be_valid
    end

    it 'strips the name' do
      expect(described_class.create!(account: account, name: '  읽을 것  ').name).to eq '읽을 것'
    end

    it 'strips full-width spaces, no-break spaces and zero-width characters at both ends' do
      name = "\u3000\u00A0\u200B\uFEFF읽을 것\u200C\u200D\u3000 "

      expect(described_class.create!(account: account, name: name).name).to eq '읽을 것'
    end

    it 'keeps such characters inside the name' do
      expect(described_class.create!(account: account, name: "읽을\u3000것").name).to eq "읽을\u3000것"
    end

    it 'refuses a name made only of invisible characters' do
      folder = described_class.new(account: account, name: "\u3000\u00A0\u200B\u200C\u200D\uFEFF ")

      expect(folder).to_not be_valid
      expect(folder.errors[:name]).to be_present
    end

    it 'allows at most 50 folders per account' do
      stub_const("#{described_class}::PER_ACCOUNT_LIMIT", 2)
      Fabricate.times(2, :bookmark_folder, account: account)

      folder = described_class.new(account: account, name: 'one more')

      expect(folder).to_not be_valid
      expect(folder.errors[:base]).to include(I18n.t('bookmark_folders.errors.limit', limit: 2))
    end
  end

  it 'places a new folder last' do
    first = Fabricate(:bookmark_folder, account: account)
    second = Fabricate(:bookmark_folder, account: account)

    expect([first.position, second.position]).to eq [0, 1]
  end

  describe '.create_for!' do
    it 'creates the folder at the end while holding the per-account lock', :aggregate_failures do
      Fabricate(:bookmark_folder, account: account)
      held = nil
      allow(described_class).to receive(:with_account_lock).and_wrap_original do |original, *args, &block|
        original.call(*args) do
          held = described_class.connection.select_value('SELECT count(*) FROM pg_locks WHERE locktype = \'advisory\' AND pid = pg_backend_pid()').to_i
          block.call
        end
      end

      folder = described_class.create_for!(account, name: 'new')

      expect(folder.position).to eq 1
      expect(held).to eq 1
    end

    it 'does not create a folder over the limit' do
      stub_const("#{described_class}::PER_ACCOUNT_LIMIT", 1)
      Fabricate(:bookmark_folder, account: account)

      expect { described_class.create_for!(account, name: 'one more') }.to raise_error(ActiveRecord::RecordInvalid)
      expect(account.bookmark_folders.count).to eq 1
    end
  end

  describe '.order_list?' do
    it 'accepts distinct numeric ids only' do
      expect(described_class.order_list?(%w(1 2))).to be(true)
      expect(described_class.order_list?([])).to be(true)
      expect(described_class.order_list?(%w(1 1))).to be(false)
      expect(described_class.order_list?('1')).to be(false)
      expect(described_class.order_list?([{}])).to be(false)
      expect(described_class.order_list?((1..51).to_a)).to be(false)
    end
  end

  describe '.reorder!' do
    let!(:folders) { Fabricate.times(3, :bookmark_folder, account: account) }

    it 'rewrites the order when given every folder of the account' do
      expect(described_class.reorder!(account, folders.reverse.map(&:id))).to be(true)

      expect(account.bookmark_folders.ordered.map(&:id)).to eq folders.reverse.map(&:id)
    end

    it 'writes every position with a single UPDATE' do
      updates = []
      subscriber = ActiveSupport::Notifications.subscribe('sql.active_record') do |*, payload|
        updates << payload[:sql] if payload[:sql].start_with?('UPDATE')
      end

      described_class.reorder!(account, folders.reverse.map(&:id))

      expect(updates.size).to eq 1
      expect(account.bookmark_folders.ordered.pluck(:position)).to eq [0, 1, 2]
    ensure
      ActiveSupport::Notifications.unsubscribe(subscriber)
    end

    it 'does not touch the folders of other accounts' do
      other = Fabricate(:bookmark_folder)
      other.update_column(:position, 7)

      described_class.reorder!(account, folders.reverse.map(&:id))

      expect(other.reload.position).to eq 7
    end

    it 'refuses a list that is missing a folder created in the meantime' do
      stale_ids = folders.map(&:id)
      Fabricate(:bookmark_folder, account: account)

      expect(described_class.reorder!(account, stale_ids)).to be(false)
    end

    it 'refuses a partial or foreign list' do
      other = Fabricate(:bookmark_folder)

      expect(described_class.reorder!(account, folders.first(2).map(&:id))).to be(false)
      expect(described_class.reorder!(account, folders.first(2).map(&:id) + [other.id])).to be(false)
      expect(account.bookmark_folders.ordered.map(&:id)).to eq folders.map(&:id)
    end
  end

  describe 'items' do
    let(:folder) { Fabricate(:bookmark_folder, account: account) }
    let(:bookmark) { Fabricate(:bookmark, account: account) }

    it 'refuses a bookmark of somebody else' do
      item = BookmarkFolderItem.new(bookmark_folder: folder, bookmark: Fabricate(:bookmark))

      expect(item).to_not be_valid
    end

    it 'disappears when the bookmark is removed, also through delete_all' do
      BookmarkFolderItem.create!(bookmark_folder: folder, bookmark: bookmark)

      Bookmark.where(id: bookmark.id).delete_all

      expect(BookmarkFolderItem.count).to eq 0
    end

    it 'disappears when the status is destroyed' do
      BookmarkFolderItem.create!(bookmark_folder: folder, bookmark: bookmark)

      bookmark.status.destroy!

      expect(BookmarkFolderItem.count).to eq 0
    end

    it 'keeps the bookmark when the folder is destroyed' do
      BookmarkFolderItem.create!(bookmark_folder: folder, bookmark: bookmark)

      folder.destroy!

      expect(Bookmark.exists?(bookmark.id)).to be(true)
      expect(BookmarkFolderItem.count).to eq 0
    end
  end
end
