# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Streaming envelopes the frozen web frontend parses' do
  let(:user)    { Fabricate(:user) }
  let(:me)      { user.account }
  let(:partner) { Fabricate(:user).account }
  let(:headers) { { 'Authorization' => "Bearer #{Fabricate(:accessible_access_token, resource_owner_id: user.id, scopes: 'read write').token}" } }

  let(:partner_headers) do
    { 'Authorization' => "Bearer #{Fabricate(:accessible_access_token, resource_owner_id: partner.user.id, scopes: 'read write').token}" }
  end

  let(:published) { [] }

  before do
    allow(Mastodon::DmChat).to receive(:enabled?).and_return(true)
    allow(redis).to receive(:publish).and_wrap_original do |original, channel, message|
      published << [channel, JSON.parse(message)]
      original.call(channel, message)
    end
  end

  def envelopes(channel, event)
    published.select { |published_channel, envelope| published_channel == channel && envelope['event'] == event }.map(&:last)
  end

  def send_dm(text, to:, from_headers: headers)
    post '/api/v1/statuses', headers: from_headers, params: {
      status: "@#{to.acct} #{text}",
      visibility: 'direct',
      allowed_mentions: [to.id.to_s],
    }
    expect(response).to have_http_status(200)
    response.parsed_body
  end

  describe 'dm.read' do
    it "tells the other member where the reader's cursor is, as an object of string ids" do
      post '/api/v1/dm_rooms', headers: headers, params: { account_ids: [partner.id.to_s] }
      room_id = response.parsed_body[:id]
      message = send_dm('hello', to: partner)

      post "/api/v1/dm_rooms/#{room_id}/read", headers: partner_headers
      expect(response).to have_http_status(200)

      expect(envelopes("timeline:direct:#{me.id}", 'dm.read')).to eq [
        { 'event' => 'dm.read', 'payload' => { 'dm_room_id' => room_id, 'account_id' => partner.id.to_s, 'last_read_status_id' => message[:id] } },
      ]
      expect(envelopes("timeline:direct:#{partner.id}", 'dm.read').pluck('payload').pluck('account_id')).to_not include(partner.id.to_s)
    end
  end

  describe 'conversation' do
    it 'carries the room preview with the author of the last message' do
      conversation = Fabricate(:account_conversation, account: me)
      status = PostStatusService.new.call(partner, text: "@#{me.acct} hi", visibility: 'direct')
      conversation.update!(last_status_id: status.id, status_ids: [status.id], participant_account_ids: [partner.id])

      PushConversationWorker.new.perform(conversation.id)

      payload = envelopes("timeline:direct:#{me.id}", 'conversation').sole['payload']
      expect(payload).to include('id' => conversation.id.to_s, 'unread' => false)
      expect(payload.dig('last_status', 'account', 'id')).to eq partner.id.to_s
      expect(payload['accounts'].pluck('id')).to eq [partner.id.to_s]
    end
  end

  describe 'notification', :inline_jobs do
    it 'labels a direct mention so the web UI can keep it out of the notification column' do
      partner.follow!(me)
      me.follow!(partner)
      redis.set("subscribed:timeline:#{me.id}", '1')

      status = PostStatusService.new.call(partner, text: "@#{me.acct} 몰래", visibility: 'direct')

      payload = envelopes("timeline:#{me.id}:notifications", 'notification').sole['payload']
      expect(payload).to include('type' => 'mention')
      expect(payload['status']).to include('id' => status.id.to_s, 'visibility' => 'direct')
    end
  end
end
