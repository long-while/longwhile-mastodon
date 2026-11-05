# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Admin Dashboard' do
  describe 'Viewing the dashboard page' do
    let(:user) { Fabricate(:owner_user) }

    before do
      stub_system_checks
      Fabricate :software_update
      Fabricate :tag, requested_review_at: 5.minutes.ago
      sign_in(user)
    end

    it 'returns page with system check messages' do
      visit admin_dashboard_path

      expect(page)
        .to have_title(I18n.t('admin.dashboard.title'))
        .and have_text(I18n.t('admin.system_checks.software_version_patch_check.message_html'))
        .and have_text(ActionController::Base.helpers.strip_tags(I18n.t('admin.dashboard.pending_users_html', count: 0)))
      # 대기 중인 해시태그 칸은 이 포크가 지웠다(8bcadda03d, 해시태그 검토 화면 삭제). 화면은 한국어 고정.
      expect(page)
        .to have_no_content(ActionController::Base.helpers.strip_tags(I18n.t('admin.dashboard.pending_tags_html', count: 0)))
    end

    private

    def stub_system_checks
      stub_const 'Admin::SystemCheck::ACTIVE_CHECKS', [
        Admin::SystemCheck::SoftwareVersionCheck,
      ]
    end
  end
end
