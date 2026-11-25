# frozen_string_literal: true

require 'rails_helper'

RSpec.describe MultiAccountLink do
  let(:alice) { Fabricate(:user) }
  let(:bob) { Fabricate(:user) }
  let(:carol) { Fabricate(:user) }
  let(:dave) { Fabricate(:user) }

  describe '.link!' do
    it 'links two users in both directions' do
      described_class.link!(alice.id, bob.id)

      expect(described_class.linked?(alice.id, bob.id)).to be(true)
      expect(described_class.linked?(bob.id, alice.id)).to be(true)
    end

    it 'closes the group when a third account joins through either member' do
      described_class.link!(alice.id, bob.id)
      described_class.link!(bob.id, carol.id)

      expect(described_class.linked?(alice.id, carol.id)).to be(true)
      expect(described_class.linked?(carol.id, alice.id)).to be(true)
    end

    it 'merges two existing groups' do
      described_class.link!(alice.id, bob.id)
      described_class.link!(carol.id, dave.id)
      described_class.link!(bob.id, carol.id)

      expect(described_class.linked?(alice.id, dave.id)).to be(true)
      expect(described_class.where(user_id: alice.id).count).to eq(3)
    end

    it 'is idempotent' do
      described_class.link!(alice.id, bob.id)

      expect { described_class.link!(alice.id, bob.id) }.to_not(change(described_class, :count))
    end

    it 'inserts only the missing pairs' do
      described_class.link!(alice.id, bob.id)

      expect { described_class.link!(bob.id, carol.id) }.to change(described_class, :count).by(4)
    end

    it 'writes nothing when the group is already complete' do
      described_class.link!(alice.id, bob.id)
      described_class.link!(bob.id, carol.id)

      expect { described_class.link!(alice.id, carol.id) }.to_not(change(described_class, :count))
    end

    it 'refuses to grow a group past the cap and leaves it unchanged' do
      users = Fabricate.times(described_class::MAX_GROUP_SIZE, :user)
      users.drop(1).each { |user| described_class.link!(users.first.id, user.id) }
      outsider = Fabricate(:user)

      expect { described_class.link!(users.first.id, outsider.id) }
        .to raise_error(described_class::GroupTooLargeError)
      expect(described_class.linked?(outsider.id, users.first.id)).to be(false)
      expect(described_class.where(user_id: users.first.id).count).to eq(described_class::MAX_GROUP_SIZE - 1)
    end

    it 'accepts a group of exactly the cap' do
      users = Fabricate.times(described_class::MAX_GROUP_SIZE, :user)

      expect { users.drop(1).each { |user| described_class.link!(users.first.id, user.id) } }.to_not raise_error
    end

    it 'ignores blank ids and self links' do
      expect do
        described_class.link!(nil, bob.id)
        described_class.link!(alice.id, alice.id)
      end.to_not(change(described_class, :count))
    end
  end

  describe '.linked?' do
    it 'treats a user as linked to themselves' do
      expect(described_class.linked?(alice.id, alice.id)).to be(true)
    end

    it 'is false for strangers and blanks' do
      expect(described_class.linked?(alice.id, bob.id)).to be(false)
      expect(described_class.linked?(nil, bob.id)).to be(false)
    end
  end

  describe '.unlink_all!' do
    it 'removes the user from the group but keeps the rest connected' do
      described_class.link!(alice.id, bob.id)
      described_class.link!(alice.id, carol.id)

      described_class.unlink_all!(alice.id)

      expect(described_class.linked?(alice.id, bob.id)).to be(false)
      expect(described_class.linked?(carol.id, alice.id)).to be(false)
      expect(described_class.linked?(bob.id, carol.id)).to be(true)
    end
  end

  it 'disappears with the user' do
    described_class.link!(alice.id, bob.id)

    alice.destroy!

    expect(described_class.where(peer_user_id: alice.id)).to be_empty
  end
end
