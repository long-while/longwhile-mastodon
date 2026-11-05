# frozen_string_literal: true

require 'rails_helper'

RSpec.describe REST::FeaturedTagSerializer do
  subject do
    serialized_record_json(
      featured_tag,
      described_class
    )
  end

  let(:featured_tag) { Fabricate :featured_tag }

  context 'when last_status_at is populated' do
    before do
      featured_tag.increment(DateTime.new(2024, 11, 28, 16, 20, 0))
    end

    # 날짜는 인스턴스 시간대(config.time_zone = 'Asia/Seoul')로 자른다. UTC 16:20 은 서울 다음 날 01:20 이다.
    it 'is serialized as yyyy-mm-dd' do
      expect(subject['last_status_at']).to eq('2024-11-29')
    end
  end
end
