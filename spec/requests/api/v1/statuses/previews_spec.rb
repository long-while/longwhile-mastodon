# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'API V1 Statuses Previews' do
  let(:user) { Fabricate(:user) }
  let(:scopes) { 'write:statuses' }
  let(:token) { Fabricate(:accessible_access_token, resource_owner_id: user.id, scopes: scopes) }
  let(:headers) { { 'Authorization' => "Bearer #{token.token}" } }

  def preview(params)
    post '/api/v1/statuses/preview', headers: headers, params: params, as: :json
  end

  def mention_link(handle)
    %(class="u-url mention">@<span>#{handle}</span></a>)
  end

  it 'renders the text the same way a post is rendered' do
    preview(status: "[color:f00]빨강[/color] **굵게**\n둘째 줄", spoiler_text: '경고')

    expect(response).to have_http_status(200)
    expect(response.parsed_body[:content]).to eq '<p><span style="color: #f00;">빨강</span> <strong>굵게</strong><br />둘째 줄</p>'
    expect(response.parsed_body[:spoiler_text]).to eq '경고'
  end

  it 'escapes HTML in the text' do
    preview(status: '<script>alert(1)</script><img src=x onerror=alert(1)>')

    expect(response.parsed_body[:content]).to eq '<p>&lt;script&gt;alert(1)&lt;/script&gt;&lt;img src=x onerror=alert(1)&gt;</p>'
  end

  it 'does not create anything or look anything up remotely', :aggregate_failures do
    allow(ResolveAccountService).to receive(:new)
    allow(EntityCache.instance).to receive(:mention)
    headers

    expect { preview(status: 'hello #tag @nobody @ghost@remote.example') }.to_not(change { [Status.count, Account.count, Mention.count] })

    expect(response.parsed_body[:content]).to include('#<span>tag</span>', ' @nobody @ghost@remote.example</p>')
    expect(Tag.where(name: 'tag')).to_not exist
    expect(ResolveAccountService).to_not have_received(:new)
    expect(EntityCache.instance).to_not have_received(:mention)
  end

  describe 'mentions' do
    let!(:alice) { Fabricate(:user, account_attributes: { username: 'alice' }).account }

    it 'links an account the requester may mention' do
      preview(status: 'hi @alice')

      expect(response.parsed_body[:content]).to include(mention_link('alice'))
    end

    it 'links a known remote account' do
      Fabricate(:account, username: 'carol', domain: 'remote.example', protocol: :activitypub)

      preview(status: 'hi @carol@remote.example')

      expect(response.parsed_body[:content]).to include(mention_link('carol'))
    end

    it 'does not link a suspended account and renders it like an unknown one' do
      Fabricate(:user, account_attributes: { username: 'bob', suspended_at: Time.now.utc })

      preview(status: 'hi @bob @nobody')

      expect(response.parsed_body[:content]).to eq '<p>hi @bob @nobody</p>'
    end

    it 'does not link a suspended remote account' do
      Fabricate(:account, username: 'gone', domain: 'remote.example', protocol: :activitypub, suspended_at: Time.now.utc)

      preview(status: 'hi @gone@remote.example')

      expect(response.parsed_body[:content]).to eq '<p>hi @gone@remote.example</p>'
    end

    it 'does not link an account that blocks the requester, and looks the same as an unknown one', :aggregate_failures do
      Fabricate(:block, account: alice, target_account: user.account)

      preview(status: 'hi @alice')
      blocked_content = response.parsed_body[:content]
      preview(status: 'hi @nobody')

      expect(blocked_content).to eq '<p>hi @alice</p>'
      expect(response.parsed_body[:content]).to eq '<p>hi @nobody</p>'
    end

    it 'does not link an account the requester blocks' do
      Fabricate(:block, account: user.account, target_account: alice)

      preview(status: 'hi @alice')

      expect(response.parsed_body[:content]).to eq '<p>hi @alice</p>'
    end

    it 'does not link a remote account on a domain the requester blocks' do
      Fabricate(:account, username: 'carol', domain: 'remote.example', protocol: :activitypub)
      Fabricate(:account_domain_block, account: user.account, domain: 'remote.example')

      preview(status: 'hi @carol@remote.example')

      expect(response.parsed_body[:content]).to eq '<p>hi @carol@remote.example</p>'
    end

    it 'does not link a local account that is not confirmed yet' do
      Fabricate(:user, confirmed_at: nil, account_attributes: { username: 'newbie' })

      preview(status: 'hi @newbie')

      expect(response.parsed_body[:content]).to eq '<p>hi @newbie</p>'
    end

    it 'links the allowed accounts and not the rest in the same text', :aggregate_failures do
      Fabricate(:block, account: Fabricate(:user, account_attributes: { username: 'dave' }).account, target_account: user.account)

      preview(status: '@alice @dave')

      expect(response.parsed_body[:content]).to include(mention_link('alice'))
      expect(response.parsed_body[:content]).to end_with(' @dave</p>')
    end
  end

  describe 'the input limit' do
    before { allow(StatusLengthValidator).to receive(:max_chars).and_return(500) }

    it 'accepts text up to the preview limit' do
      preview(status: 'a' * 1000)

      expect(response).to have_http_status(200)
    end

    it 'refuses longer input and names the preview limit, not the post limit', :aggregate_failures do
      preview(status: 'a' * 1001)

      expect(response).to have_http_status(422)
      expect(response.parsed_body[:error]).to eq I18n.t('statuses.preview_over_limit', max: 1000, locale: :ko)
      expect(response.parsed_body[:error]).to include('1000')
    end

    it 'counts the spoiler text too' do
      preview(status: 'a' * 600, spoiler_text: 'b' * 401)

      expect(response).to have_http_status(422)
    end
  end

  context 'without a write scope' do
    let(:scopes) { 'read' }

    it 'is forbidden' do
      preview(status: 'hi')

      expect(response).to have_http_status(403)
    end
  end

  context 'without a token' do
    let(:headers) { {} }

    it 'requires authentication' do
      preview(status: 'hi')

      expect(response).to have_http_status(401)
    end
  end
end
