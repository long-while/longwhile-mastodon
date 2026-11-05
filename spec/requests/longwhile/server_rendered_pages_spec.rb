# frozen_string_literal: true

require 'rails_helper'

# @_longwhile — 서버가 그리는 화면(운영·환경설정·인증)은 상류 4.7 의 HAML 을 그대로 받았다.
# 포크가 지운 헬퍼·키·라우트를 상류 뷰가 찾거나, 포크 뷰가 상류에서 사라진 것을 찾으면 그
# 화면만 조용히 500 이 된다. GET 화면을 전부 한 번씩 열어 본다.
#
#   주소를 손으로 적지 않고 라우트에서 뽑는다 — 상류가 화면을 더하면 저절로 여기 들어온다.
#   :id 가 필요한 화면은 param_pages 에서 레코드를 만들어 연다.
#
#   "translation missing" 도 본다. 영어 원문에도 없는 키(상류 누락)는 운영에서 그 문구가
#   그대로 화면에 나온다 — 4.7 의 read:collections 범위, update_tag 운영 기록 종류가 그랬다.
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
      # 운영 첫 화면의 시스템 점검이 미디어 목록 주소를 실제로 불러 본다(공개돼 있으면 경고).
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

  # 로그인하면 인증 화면은 홈으로 돌려보내므로 로그아웃 상태로 따로 연다.
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
