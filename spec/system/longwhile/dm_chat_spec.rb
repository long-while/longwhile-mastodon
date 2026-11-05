# frozen_string_literal: true

require 'rails_helper'

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
