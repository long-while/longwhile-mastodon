# frozen_string_literal: true

require 'rails_helper'

# @_longwhile — 웹 앱 껍데기(home#index)가 고정된 프론트에 넘기는 것.
#
#     라우트      포크가 더한 화면 주소가 서버에도 있어야 새로고침·직접 입력이 404 가 아니다
#                (config/routes/web_app.rb, CLAUDE.md "새 화면을 추가하면")
#     초기 상태   initial_state.js 가 meta 에서 읽는 포크 필드
#     테마        사용자 설정의 테마가 그 스타일시트로 이어진다(config/themes.yml)
RSpec.describe 'Web app shell' do
  let(:user) { Fabricate(:user) }

  let(:custom_web_paths) do
    %w(
      /local
      /public
      /pending-mentions
      /messages
      /messages/all
      /messages/123
      /scheduled_statuses
      /notifications
    ) + ["/@#{user.account.username}/favourites"]
  end

  def initial_state
    script = Nokogiri::HTML(response.body).at_css('script#initial-state')
    JSON.parse(script.text)
  end

  describe 'custom screens' do
    it 'serves the web app on every custom path once signed in' do
      sign_in user

      custom_web_paths.each do |path|
        get path

        expect(response).to have_http_status(200), "#{path} answered #{response.status}"
        expect(response.body).to include('id="initial-state"'), "#{path} did not render the web app"
      end
    end

    context 'when signed out on this non-federating instance' do
      around do |example|
        original = Rails.configuration.x.mastodon.limited_federation_mode
        Rails.configuration.x.mastodon.limited_federation_mode = true
        example.run
      ensure
        Rails.configuration.x.mastodon.limited_federation_mode = original
      end

      it 'sends every custom path to the sign-in form' do
        custom_web_paths.each do |path|
          get path

          expect(response).to redirect_to(new_user_session_path), "#{path} answered #{response.status}"
        end
      end
    end
  end

  describe 'initial state' do
    before { sign_in user }

    it 'carries the scheduled post limits the composer validates against' do
      get '/home'

      expect(initial_state['meta']).to include(
        'scheduled_status_minimum_offset' => ScheduledStatus::MINIMUM_OFFSET.to_i,
        'scheduled_status_total_limit' => ScheduledStatus::TOTAL_LIMIT,
        'scheduled_status_daily_limit' => ScheduledStatus::DAILY_LIMIT
      )
    end

    it 'follows the DM chat flag' do
      allow(Mastodon::DmChat).to receive(:enabled?).and_return(true)
      get '/home'
      expect(initial_state['meta']).to include('dm_chat_enabled' => true)

      allow(Mastodon::DmChat).to receive(:enabled?).and_return(false)
      get '/home'
      expect(initial_state['meta']).to include('dm_chat_enabled' => false)
    end

    it "carries the user's layout choice in meta" do
      user.update!(settings_attributes: { 'web.advanced_layout': true })

      get '/home'

      expect(initial_state['meta']).to include('advanced_layout' => true)
    end

    # 프론트는 role.permissions 로 운영진 메뉴(전체 메시지 등)를 띄운다.
    it 'carries the role permissions as a string' do
      get '/home'

      expect(initial_state.dig('role', 'permissions')).to be_a(String)
    end
  end

  describe 'theme' do
    it 'offers the bird-ui themes' do
      expect(Themes.instance.names).to include('mastodon-bird-ui-light', 'mastodon-bird-ui-dark')
    end

    it 'defaults to the instance theme' do
      sign_in user

      get '/home'

      expect(Setting.theme).to eq 'mastodon-bird-ui-light'
      expect(response.body).to match(/<link[^>]+mastodon-bird-ui-light[^>]+\.css/)
    end

    it "uses the user's chosen theme" do
      user.update!(settings_attributes: { theme: 'mastodon-bird-ui-dark' })
      sign_in user

      get '/home'

      expect(response.body).to match(/<link[^>]+mastodon-bird-ui-dark[^>]+\.css/)
      expect(response.body).to_not match(/<link[^>]+mastodon-bird-ui-light[^>]+\.css/)
    end
  end
end
