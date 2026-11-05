# frozen_string_literal: true

require 'rails_helper'

# @_longwhile — DM 채팅(/messages): 목록 → 방 → 보내기. 보내기는 POST /api/v1/statuses
#   (visibility: direct) 이고, 서버가 같은 요청 안에서 방에 붙인다(PostStatusService).
#
#   :inline_jobs 를 쓰지 않는다. 쓰면 팬아웃이 요청 안에서 스트리밍으로 말풍선을 먼저
#   보내, 서버가 방에 붙이기 전에 화면이 확정 상태가 된다(검사가 경주한다). 방 귀속은
#   잡 없이도 PostStatusService 가 동기로 한다.
RSpec.describe 'DM chat', :js, :streaming do
  let(:user)    { Fabricate(:user, account: Fabricate(:account, username: 'alice')) }
  let(:partner) { Fabricate(:user, account: Fabricate(:account, username: 'partner')).account }

  let(:room) { DmRoom.joins(:dm_room_members).find_by!(dm_room_members: { account_id: user.account.id }) }

  before do
    allow(Mastodon::DmChat).to receive(:enabled?).and_return(true)
    Web::Setting.where(user: user).first_or_initialize(user: user).update!(data: { introductionVersion: 2018_12_16_044202 })
    PostStatusService.new.call(partner, text: '@alice first-message-from-partner', visibility: :direct)
    sign_in user
  end

  it 'opens the room from the list and sends a message' do
    visit '/messages'

    find(".dm-room-item[href='/messages/#{room.id}']", text: 'first-message-from-partner').click

    expect(page).to have_current_path("/messages/#{room.id}")
    expect(page).to have_css('.dm-message__bubble__text', text: 'first-message-from-partner')

    find('.dm-composer__textarea').fill_in(with: 'reply-from-alice')
    find('.dm-composer__send').click

    expect(page).to have_css('.dm-message__bubble__text', text: 'reply-from-alice')
    expect(page).to have_no_css('.dm-composer__send:not([disabled])')

    sent = Status.where(account: user.account).order(:id).last
    expect(sent).to have_attributes(visibility: 'direct')
    expect(sent.text).to include('reply-from-alice')
    expect(room.reload.last_status_id).to eq sent.id
  end
end
