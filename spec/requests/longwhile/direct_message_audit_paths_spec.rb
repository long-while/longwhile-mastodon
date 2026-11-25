# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Direct message audit coverage' do
  let(:alice) { Fabricate(:user, account_attributes: { username: 'alice' }) }
  let(:bob)   { Fabricate(:user, account_attributes: { username: 'bob' }) }
  let(:owner) { Fabricate(:owner_user) }

  let!(:dm) do
    Fabricate(:status, account: alice.account, visibility: :direct, text: 'private words').tap do |status|
      status.mentions.create!(account: bob.account)
    end
  end

  def view_logs
    Admin::ActionLog.where(action: 'view', target_type: 'Status', target_id: dm.id)
  end

  def headers_for(user)
    token = Fabricate(:accessible_access_token, resource_owner_id: user.id, scopes: 'read write')
    { 'Authorization' => "Bearer #{token.token}" }
  end

  describe 'Api::V1::Statuses::BaseController descendants' do
    it 'records a staff member requesting the edit history' do
      expect { get "/api/v1/statuses/#{dm.id}/history", headers: headers_for(owner) }
        .to change(view_logs, :count).by(1)

      expect(view_logs.last.account).to eq owner.account
    end

    it 'records a staff member requesting a translation, whatever the translator answers' do
      expect { post "/api/v1/statuses/#{dm.id}/translate", headers: headers_for(owner) }
        .to change(view_logs, :count).by(1)
    end

    it 'records a staff member listing who favourited it' do
      expect { get "/api/v1/statuses/#{dm.id}/favourited_by", headers: headers_for(owner) }
        .to change(view_logs, :count).by(1)
    end

    it 'does not record the author' do
      expect { get "/api/v1/statuses/#{dm.id}/history", headers: headers_for(alice) }
        .to_not change(view_logs, :count)
    end

    it 'does not record a mentioned recipient' do
      expect { get "/api/v1/statuses/#{dm.id}/history", headers: headers_for(bob) }
        .to_not change(view_logs, :count)
    end
  end

  describe 'Admin::StatusesController' do
    before { sign_in owner }

    it 'records opening the status page' do
      expect { get admin_account_status_path(alice.account.id, dm.id) }
        .to change(view_logs, :count).by(1)
      expect(response).to have_http_status(200)
    end

    it 'records the DMs shown in the account status list' do
      expect { get admin_account_statuses_path(alice.account.id) }
        .to change(view_logs, :count).by(1)
      expect(response).to have_http_status(200)
    end
  end

  describe 'GET /@:username/:id (HTML)' do
    it 'records a staff member opening it' do
      sign_in owner

      expect { get "/@alice/#{dm.id}" }.to change(view_logs, :count).by(1)
    end

    it 'does not record the author' do
      sign_in alice

      expect { get "/@alice/#{dm.id}" }.to_not change(view_logs, :count)
    end

    it 'does not record a mentioned recipient' do
      sign_in bob

      expect { get "/@alice/#{dm.id}" }.to_not change(view_logs, :count)
    end
  end
end
