# frozen_string_literal: true

require 'rails_helper'

# @_longwhile — 알림창과 "답장할 멘션"(/pending-mentions). 답장할 멘션은 알림 그룹의
#   status_visibility 와 글의 replied 로 프론트가 거른다(selectors/notifications.ts).
#   서버가 그 둘 중 하나라도 잘못 주면 여기서 답한 멘션이 남거나 전부 사라진다.
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
