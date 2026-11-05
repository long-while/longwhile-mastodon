# frozen_string_literal: true

require 'rails_helper'

RSpec.describe InitialStateSerializer do
  subject { serialized_record_json(presenter, described_class)['meta'] }

  let(:presenter) { InitialStatePresenter.new(settings: {}, token: nil, current_account: nil) }

  # 이 포크의 웹 앱(4.4)은 4.5 에서 사라진 두 값을 아직 읽는다. 새 설정에서 다시 만든다.
  describe 'the 4.4 settings the web app still reads' do
    it 'reports timeline_preview from the local live feed access' do
      Setting.local_live_feed_access = 'public'
      expect(subject['timeline_preview']).to be(true)

      Setting.local_live_feed_access = 'authenticated'
      expect(serialized_record_json(presenter, described_class)['meta']['timeline_preview']).to be(false)
    end

    it 'reports trends_as_landing_page from the landing page setting' do
      Setting.landing_page = 'trends'
      expect(subject['trends_as_landing_page']).to be(true)

      Setting.landing_page = 'about'
      expect(serialized_record_json(presenter, described_class)['meta']['trends_as_landing_page']).to be(false)
    end
  end

  it 'keeps the fork-specific meta values' do
    expect(subject).to include(
      'dm_chat_enabled' => Mastodon::DmChat.enabled?,
      'scheduled_status_total_limit' => ScheduledStatus::TOTAL_LIMIT,
      'scheduled_status_daily_limit' => ScheduledStatus::DAILY_LIMIT,
      'scheduled_status_minimum_offset' => ScheduledStatus::MINIMUM_OFFSET.to_i
    )
  end
end
