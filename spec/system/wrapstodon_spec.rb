# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Wrapstodon' do
  describe 'Viewing a wrapstodon' do
    let(:generated_annual_report) { AnnualReport.new(user.account, Time.current.year).generate }
    let(:user) { Fabricate :user }

    context 'when signed in' do
      before { sign_in user }

      # 이 포크는 연말 결산을 끈다(config/settings.yml). 고정된 프런트에는 그 화면이 없다.
      it 'does not serve the wrap page while the feature is off' do
        visit public_wrapstodon_path(account_username: user.account.username, year: generated_annual_report.year, share_key: generated_annual_report.share_key)

        expect(page.status_code).to eq 404
      end
    end
  end
end
