# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Thread heads' do
  let(:user)    { Fabricate(:user) }
  let(:viewer)  { user.account }
  let(:alice)   { Fabricate(:account, username: 'alice') }
  let(:bob)     { Fabricate(:account, username: 'bob') }
  let(:scopes)  { 'read:statuses' }
  let(:token)   { Fabricate(:accessible_access_token, resource_owner_id: user.id, scopes: scopes) }
  let(:headers) { { 'Authorization' => "Bearer #{token.token}" } }

  before do
    viewer.follow!(alice)
    viewer.follow!(bob)
  end

  def post_by(account, thread: nil, visibility: :private, text: nil)
    Fabricate(:status, account: account, thread: thread, visibility: visibility, text: text || "by #{account.username}")
  end

  def chain(*accounts)
    accounts.each_with_object([]) { |account, statuses| statuses << post_by(account, thread: statuses.last) }
  end

  def thread_heads(*statuses, as: headers)
    get '/api/v1/statuses/thread_heads', headers: as, params: { id: statuses.map { |s| s.id.to_s } }
    expect(response).to have_http_status(200)
    response.parsed_body
  end

  def heads_by_status(*statuses)
    thread_heads(*statuses).to_h { |entry| [entry[:status_id], [entry[:head][:id], entry[:omitted_count]]] }
  end

  it 'gives the parent of a two-post chain' do
    root, reply = chain(alice, bob)

    expect(thread_heads(reply)).to contain_exactly(
      a_hash_including(status_id: reply.id.to_s, omitted_count: 0, head: a_hash_including(id: root.id.to_s))
    )
  end

  it 'gives the top of a longer chain and counts the posts in between' do
    root, first, second, last = chain(alice, bob, alice, bob)

    expect(heads_by_status(last, second, first)).to eq(
      last.id.to_s => [root.id.to_s, 2],
      second.id.to_s => [root.id.to_s, 1],
      first.id.to_s => [root.id.to_s, 0]
    )
  end

  it 'answers in the order asked and leaves out posts that are not replies' do
    root, first, second = chain(alice, bob, alice)

    expect(thread_heads(second, root, first).pluck(:status_id)).to eq [second.id.to_s, first.id.to_s]
  end

  it 'answers an empty list for no ids' do
    expect(thread_heads).to eq []
  end

  it 'marks the head as replied when the viewer is in the chain' do
    root, _mine, reply = chain(alice, viewer, bob)

    head = thread_heads(reply).sole[:head]
    expect(head).to include(id: root.id.to_s, replied: true)
  end

  describe 'ancestors the viewer cannot see' do
    let(:stranger) { Fabricate(:account, username: 'stranger') }

    it 'starts from the nearest visible post when the root belongs to someone not followed' do
      root  = post_by(stranger, text: 'secret root')
      first = post_by(alice, thread: root)
      last  = post_by(bob, thread: first)

      expect(heads_by_status(last)).to eq(last.id.to_s => [first.id.to_s, 0])
      expect(response.body).to_not include('secret root')
    end

    it 'skips an invisible post in the middle without counting it' do
      root   = post_by(alice)
      middle = post_by(stranger, thread: root, text: 'secret middle')
      last   = post_by(bob, thread: middle)

      expect(heads_by_status(last)).to eq(last.id.to_s => [root.id.to_s, 0])
      expect(response.body).to_not include('secret middle')
    end

    it 'gives nothing when no ancestor is visible' do
      root = post_by(stranger, text: 'secret root')
      last = post_by(alice, thread: root)

      expect(thread_heads(last)).to eq []
    end

    it 'shows a public root of someone not followed' do
      root = post_by(stranger, visibility: :public)
      last = post_by(alice, thread: root)

      expect(heads_by_status(last)).to eq(last.id.to_s => [root.id.to_s, 0])
    end

    it 'shows an announcement of the announcement account without following it' do
      announcer = Fabricate(:account)
      announcer.update_columns(username: PublicFeed::ANNOUNCEMENT_USERNAME)
      root = post_by(announcer, visibility: :unlisted)
      last = post_by(alice, thread: root)

      expect(heads_by_status(last)).to eq(last.id.to_s => [root.id.to_s, 0])
    end

    it 'skips a deleted post' do
      root, middle, last = chain(alice, bob, alice)
      root.discard

      expect(heads_by_status(last)).to eq(last.id.to_s => [middle.id.to_s, 0])
    end
  end

  describe 'blocks and mutes' do
    let(:carol) { Fabricate(:account, username: 'carol') }

    before { viewer.follow!(carol) }

    it 'skips a blocked author at the root' do
      root, first, last = chain(carol, alice, bob)
      viewer.block!(carol)

      expect(heads_by_status(last)).to eq(last.id.to_s => [first.id.to_s, 0])
      expect(response.body).to_not include(root.text)
    end

    it 'skips a blocked author in the middle' do
      root, _middle, last = chain(alice, carol, bob)
      viewer.block!(carol)

      expect(heads_by_status(last)).to eq(last.id.to_s => [root.id.to_s, 0])
    end

    it 'skips an author who blocked the viewer' do
      root, first, last = chain(carol, alice, bob)
      root.update!(visibility: :public)
      carol.block!(viewer)

      expect(heads_by_status(last)).to eq(last.id.to_s => [first.id.to_s, 0])
    end

    it 'skips a muted author' do
      _root, first, last = chain(carol, alice, bob)
      viewer.mute!(carol)

      expect(heads_by_status(last)).to eq(last.id.to_s => [first.id.to_s, 0])
    end
  end

  describe 'requested posts the viewer cannot see' do
    it 'says nothing about a reply by someone not followed' do
      root  = post_by(alice)
      reply = post_by(Fabricate(:account), thread: root)

      expect(thread_heads(reply)).to eq []
    end

    it 'says nothing about an id that does not exist' do
      get '/api/v1/statuses/thread_heads', headers: headers, params: { id: %w(123456789 abc) }

      expect(response).to have_http_status(200)
      expect(response.parsed_body).to eq []
    end
  end

  describe 'direct messages' do
    def direct_by(account, recipient, thread: nil)
      Fabricate(:status, account: account, thread: thread, visibility: :direct, text: "@#{recipient.username} dm").tap do |status|
        status.mentions.create!(account: recipient)
      end
    end

    it 'gives nothing for a DM reply chain' do
      root  = direct_by(alice, viewer)
      reply = direct_by(viewer, alice, thread: root)

      expect(thread_heads(reply)).to eq []
    end

    it 'does not use a DM as the head of a non-DM reply' do
      root  = direct_by(alice, viewer)
      reply = post_by(bob, thread: root)

      expect(thread_heads(reply)).to eq []
    end

    it 'does not surface DMs to an administrator, who may read them elsewhere' do
      admin_user    = Fabricate(:admin_user)
      admin_headers = { 'Authorization' => "Bearer #{Fabricate(:accessible_access_token, resource_owner_id: admin_user.id, scopes: scopes).token}" }
      root  = direct_by(alice, bob)
      reply = direct_by(bob, alice, thread: root)
      after = post_by(alice, thread: reply)

      get "/api/v1/statuses/#{root.id}", headers: admin_headers
      expect(response).to have_http_status(200)

      expect(thread_heads(reply, after, as: admin_headers)).to eq []
    end
  end

  describe 'staff accounts' do
    let(:stranger) { Fabricate(:account, username: 'stranger') }
    let!(:root)    { post_by(stranger, text: 'secret root') }
    let!(:first)   { post_by(alice, thread: root) }
    let!(:last)    { post_by(bob, thread: first) }
    let!(:foreign) { post_by(stranger, thread: first, text: 'secret reply') }

    %i(owner_user admin_user).each do |fabricator|
      context "with #{fabricator}" do
        let(:staff)         { Fabricate(fabricator) }
        let(:staff_headers) { { 'Authorization' => "Bearer #{Fabricate(:accessible_access_token, resource_owner_id: staff.id, scopes: scopes).token}" } }

        before do
          staff.account.follow!(alice)
          staff.account.follow!(bob)
        end

        it 'gets the same heads as a regular user', :aggregate_failures do
          regular = thread_heads(last, foreign)
          staff_result = thread_heads(last, foreign, as: staff_headers)

          expect(staff_result.map { |entry| [entry[:status_id], entry[:head][:id], entry[:omitted_count]] })
            .to eq(regular.map { |entry| [entry[:status_id], entry[:head][:id], entry[:omitted_count]] })
          expect(staff_result.pluck(:status_id)).to eq [last.id.to_s]
          expect(staff_result.sole[:head][:id]).to eq first.id.to_s
          expect(response.body).to_not include('secret')
        end

        it 'still sees the root through the conversation view' do
          get "/api/v1/statuses/#{last.id}/context", headers: staff_headers

          expect(response).to have_http_status(200)
          expect(response.parsed_body[:ancestors].pluck(:id)).to eq [root.id.to_s, first.id.to_s]
        end
      end
    end
  end

  describe 'account states' do
    it 'shows the head of an anonymised account under the anonymous name', :inline_jobs do
      former = Fabricate(:user, account_attributes: { username: 'formername' }).account
      root   = post_by(former, visibility: :public, text: 'kept')
      reply  = post_by(alice, thread: root)
      DeleteAccountService.new.call(former, reserve_username: true, reserve_email: true, preserve_content: true)

      head = thread_heads(reply).sole[:head]
      expect(head).to include(id: root.id.to_s)
      expect(head[:account]).to include(username: Account::ANONYMIZED_USERNAME)
      expect(response.body).to_not include('formername')
    end

    it 'skips a self-deleted account' do
      leaver = Fabricate(:account)
      viewer.follow!(leaver)
      _root, first, last = chain(leaver, alice, bob)
      leaver.mark_deleted!

      expect(heads_by_status(last)).to eq(last.id.to_s => [first.id.to_s, 0])
    end
  end

  describe 'limits and authentication' do
    it 'refuses more than 40 ids' do
      get '/api/v1/statuses/thread_heads', headers: headers, params: { id: (1..41).map(&:to_s) }

      expect(response).to have_http_status(422)
      expect(response.parsed_body[:error]).to be_present
    end

    it 'accepts 40 ids' do
      get '/api/v1/statuses/thread_heads', headers: headers, params: { id: (1..40).map(&:to_s) }

      expect(response).to have_http_status(200)
    end

    it 'requires a token' do
      get '/api/v1/statuses/thread_heads', params: { id: ['1'] }

      expect(response).to have_http_status(401)
    end

    context 'with a token without read:statuses' do
      let(:scopes) { 'write:statuses' }

      it 'is forbidden' do
        get '/api/v1/statuses/thread_heads', headers: headers, params: { id: ['1'] }

        expect(response).to have_http_status(403)
      end
    end

    it 'requires a user behind the token' do
      app_token = Fabricate(:accessible_access_token, resource_owner_id: nil, scopes: scopes)
      get '/api/v1/statuses/thread_heads', headers: { 'Authorization' => "Bearer #{app_token.token}" }, params: { id: ['1'] }

      expect(response).to have_http_status(422)
    end
  end

  describe 'query count' do
    def query_count(statuses)
      thread_heads(*statuses)

      count = 0
      counter = lambda do |*, payload|
        next if payload[:cached] || %w(SCHEMA TRANSACTION).include?(payload[:name])

        count += 1
      end
      ActiveSupport::Notifications.subscribed(counter, 'sql.active_record') { thread_heads(*statuses) }
      count
    end

    def replies(count)
      Array.new(count) do |i|
        authors = [alice, bob, Fabricate(:account)].each { |account| viewer.follow!(account) unless account == viewer || viewer.following?(account) }
        root = post_by(authors[i % 3])
        Fabricate(:media_attachment, account: root.account, status: root) if i.even?
        post_by(authors[(i + 1) % 3], thread: post_by(authors[(i + 2) % 3], thread: root))
      end
    end

    it 'does not grow with the number of ids' do
      few  = query_count(replies(3))
      many = query_count(replies(3) + replies(20))

      expect(response.parsed_body.size).to eq 23
      expect(many).to be <= few + 2
    end
  end
end
