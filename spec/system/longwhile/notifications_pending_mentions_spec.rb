# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Notifications and pending mentions', :inline_jobs, :js, :streaming do
  let(:user) { Fabricate(:user, account: Fabricate(:account, username: 'alice')) }
  let(:bob)  { Fabricate(:user, account: Fabricate(:account, username: 'bob')).account }

  before do
    Web::Setting.where(user: user).first_or_initialize(user: user).update!(data: { introductionVersion: 2018_12_16_044202 })
    user.account.follow!(bob)
    bob.follow!(user.account)

    PostStatusService.new.call(bob, text: '@alice waiting-for-an-answer')
    answered = PostStatusService.new.call(bob, text: '@alice already-answered')
    PostStatusService.new.call(user.account, text: '@bob done', thread: answered)

    sign_in user
  end

  it 'lists both mentions in notifications' do
    visit '/notifications'

    expect(page).to have_css('.status__content', text: 'waiting-for-an-answer')
    expect(page).to have_css('.status__content', text: 'already-answered')
  end

  it 'keeps only the unanswered mention on the pending mentions page' do
    visit '/pending-mentions'

    expect(page).to have_css('.status__content', text: 'waiting-for-an-answer')
    expect(page).to have_no_css('.status__content', text: 'already-answered')
  end
end
