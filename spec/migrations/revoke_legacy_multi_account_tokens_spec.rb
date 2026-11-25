# frozen_string_literal: true

require 'rails_helper'
require Rails.root.join('db', 'post_migrate', '20261121000300_revoke_legacy_multi_account_tokens.rb')

RSpec.describe RevokeLegacyMultiAccountTokens do
  subject(:migration) { described_class.new }

  let(:user) { Fabricate(:user) }
  let!(:multi_account_app) { Doorkeeper::Application.create!(name: 'MultiAccount', redirect_uri: 'https://example.com/cb', scopes: 'read write follow') }
  let!(:web_app) { Doorkeeper::Application.create!(name: 'Web', redirect_uri: 'https://example.com/web', scopes: 'read write follow', superapp: true) }

  let!(:long_lived) do
    Fabricate(:access_token, application: multi_account_app, resource_owner_id: user.id, scopes: 'read write follow',
                             expires_in: 10.years.to_i, multi_account: true, purpose: 'multi_account_refresh', long_lived: true)
  end
  let!(:legacy_plain) do
    Fabricate(:access_token, application: multi_account_app, resource_owner_id: user.id, scopes: 'read', multi_account: false, long_lived: false)
  end
  let!(:web_session) { Fabricate(:access_token, application: web_app, resource_owner_id: user.id, scopes: 'read write follow') }
  let!(:already_revoked) do
    Fabricate(:access_token, application: multi_account_app, resource_owner_id: user.id, scopes: 'read', long_lived: true, revoked_at: 1.day.ago)
  end

  around do |example|
    original = Rails.configuration.x.multi_account.dup
    Rails.configuration.x.multi_account[:client_id] = multi_account_app.uid
    example.run
  ensure
    Rails.configuration.x.multi_account = ActiveSupport::HashWithIndifferentAccess.new(original)
  end

  def run_up
    ActiveRecord::Migration.suppress_messages { migration.up }
  end

  it 'revokes live tokens of the multi-account application, flagged or not' do
    run_up

    expect(long_lived.reload.revoked_at).to be_present
    expect(legacy_plain.reload.revoked_at).to be_present
  end

  it 'leaves web session tokens alone' do
    expect { run_up }.to_not(change { web_session.reload.revoked_at })
  end

  it 'does not touch tokens that are already revoked' do
    expect { run_up }.to_not(change { already_revoked.reload.revoked_at })
  end

  it 'removes push subscriptions bound to the revoked tokens' do
    subscription = Fabricate(:web_push_subscription, access_token: long_lived)

    run_up

    expect(Web::PushSubscription.exists?(subscription.id)).to be(false)
  end

  it 'works in several batches' do
    stub_const('RevokeLegacyMultiAccountTokens::BATCH_SIZE', 1)

    run_up

    expect(Doorkeeper::AccessToken.where(application_id: multi_account_app.id).not_revoked).to be_empty
  end

  it 'is idempotent' do
    run_up

    expect { run_up }.to_not(change { long_lived.reload.revoked_at })
  end

  it 'does nothing on rollback' do
    run_up

    expect { ActiveRecord::Migration.suppress_messages { migration.down } }.to_not(change { long_lived.reload.revoked_at })
  end
end
