# frozen_string_literal: true

require 'rails_helper'

RSpec.describe StatusPolicy, '#show?' do
  let(:author) { Fabricate(:account) }
  let(:booster) { Fabricate(:account) }
  let(:original) { Fabricate(:status, account: author, visibility: :private) }
  let(:reblog) { Fabricate(:status, account: booster, reblog: original, visibility: :private) }

  before { booster.follow!(author) }

  it 'lets the booster see their own reblog' do
    expect(described_class.new(booster, reblog).show?).to be true
  end

  it 'still lets the booster see their own reblog after unfollowing the author' do
    reblog
    booster.unfollow!(author)

    expect(described_class.new(booster, reblog).show?).to be true
  end

  it 'hides the reblog from the booster once the author blocks them' do
    reblog
    BlockService.new.call(author, booster)

    expect(described_class.new(booster, original).show?).to be false
    expect(described_class.new(booster, reblog).show?).to be false
  end

  describe AccountStatusesFilter do
    it 'drops the reblog from the booster\'s own profile once the author blocks them' do
      reblog
      BlockService.new.call(author, booster)

      expect(described_class.new(booster, booster).results.pluck(:id)).to_not include(reblog.id)
    end

    it 'keeps the reblog in the booster\'s own profile after they unfollow the author' do
      reblog
      booster.unfollow!(author)

      expect(described_class.new(booster, booster).results.pluck(:id)).to include(reblog.id)
    end
  end
end
