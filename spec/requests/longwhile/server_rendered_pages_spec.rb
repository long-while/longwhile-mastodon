# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Server-rendered pages' do
  def self.get_paths_under(prefixes)
    Rails.application.routes.routes.filter_map do |route|
      next unless route.verb.to_s.include?('GET')
      next unless (route.required_parts - [:format]).empty?

      path = route.path.spec.to_s.gsub(/\([^)]*\)/, '')
      next unless path.match?(%r{\A/(#{prefixes.join('|')})(/|\z)})

      route.constraints[:format] ? "#{path}.#{route.constraints[:format]}" : path
    end.uniq.sort
  end

  def expect_rendered(path)
    get path

    expect(response.status).to be < 500
    expect(response.body.scan(/translation[ _]missing[^<]*/i)).to be_empty
  end

  describe 'signed in as the owner' do
    let(:owner) { Fabricate(:owner_user) }
    let(:target) { Fabricate(:user).account }

    before do
      sign_in owner
      stub_request(:get, %r{/system/media_attachments/files/}).to_return(status: 403)
    end

    get_paths_under(%w(admin settings filters invites statuses_cleanup disputes follow_requests followed_tags oauth auth about privacy-policy terms)).each do |path|
      it "renders GET #{path}" do
        expect_rendered(path)
      end
    end

    def self.param_pages
      {
        'admin account' => -> { "/admin/accounts/#{target.id}" },
        'admin account statuses' => -> { "/admin/accounts/#{target.id}/statuses" },
        'admin account status' => -> { "/admin/accounts/#{target.id}/statuses/#{Fabricate(:status, account: target).id}" },
        'admin account relationships' => -> { "/admin/accounts/#{target.id}/relationships" },
        'admin account action' => -> { "/admin/accounts/#{target.id}/action/new?type=suspend" },
        'admin account change email' => -> { "/admin/accounts/#{target.id}/change_email" },
        'admin account collections' => -> { "/admin/accounts/#{target.id}/collections" },
        'admin user role' => -> { "/admin/users/#{target.user.id}/role" },
        'admin report' => -> { "/admin/reports/#{Fabricate(:report, target_account: target).id}" },
        'admin tag' => -> { "/admin/tags/#{Fabricate(:tag).id}" },
        'admin role' => -> { "/admin/roles/#{Fabricate(:user_role).id}/edit" },
        'admin rule' => -> { "/admin/rules/#{Fabricate(:rule).id}/edit" },
        'admin warning preset' => -> { "/admin/warning_presets/#{Fabricate(:account_warning_preset).id}/edit" },
        'admin announcement' => -> { "/admin/announcements/#{Fabricate(:announcement).id}/edit" },
        'admin announcement preview' => -> { "/admin/announcements/#{Fabricate(:announcement).id}/preview" },
        'admin domain block' => -> { "/admin/domain_blocks/#{Fabricate(:domain_block).id}/edit" },
        'admin instance' => -> { "/admin/instances/#{Fabricate(:account, domain: 'remote.example').domain}" },
        'admin webhook' => -> { "/admin/webhooks/#{Fabricate(:webhook).id}" },
        'admin webhook edit' => -> { "/admin/webhooks/#{Fabricate(:webhook).id}/edit" },
        'admin strike' => -> { "/admin/disputes/strikes/#{Fabricate(:account_warning, target_account: target).id}" },
        'admin username block' => -> { "/admin/username_blocks/#{Fabricate(:username_block).id}/edit" },
        'admin terms of service preview' => -> { "/admin/terms_of_service/#{Fabricate(:terms_of_service, notification_sent_at: nil).id}/preview" },
        'own strike' => -> { "/disputes/strikes/#{Fabricate(:account_warning, target_account: owner.account).id}" },
        'own application' => -> { "/settings/applications/#{Fabricate(:application, owner: owner).id}" },
        'own filter' => -> { "/filters/#{Fabricate(:custom_filter, account: owner.account).id}/edit" },
        'own filter statuses' => -> { "/filters/#{Fabricate(:custom_filter, account: owner.account).id}/statuses" },
      }
    end

    param_pages.each do |name, path|
      it "renders the #{name} page" do
        expect_rendered(instance_exec(&path))
      end
    end
  end

  describe 'signed out' do
    get_paths_under(%w(auth about privacy-policy terms)).each do |path|
      it "renders GET #{path}" do
        expect_rendered(path)
      end
    end

    it 'shows the sign-in form in Korean' do
      get '/auth/sign_in'

      expect(response).to have_http_status(200)
      expect(response.body).to include('lang="ko"')
    end
  end
end
