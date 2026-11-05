# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Trends::History do
  subject(:history) { described_class.new('tags', 123) }

  # 이 포크는 config.time_zone 이 Asia/Seoul 이다. 쓸 때(UTC 시각)와 읽을 때
  # (Time.zone 의 시각, Date)가 같은 날 키를 써야 한다. 서울 01:00 은 UTC 로 전날이다.
  before do
    travel_to(Time.find_zone!('Asia/Seoul').local(2026, 10, 29, 1, 0))
    history.add(1)
  end

  it 'reads back what was added today through #each' do
    expect(history.first.accounts).to eq 1
    expect(history.sum(&:uses)).to eq 1
  end

  it 'uses the same day key for UTC times, zoned times and DateTimes' do
    expect(history.get(Time.now.utc).uses).to eq 1
    expect(history.get(Time.zone.now).uses).to eq 1
    expect(history.get(Time.now.utc.to_datetime).uses).to eq 1
  end

  it 'reads a Date as that UTC day, like #aggregate' do
    utc_today = Time.now.utc.to_date

    expect(history.get(utc_today).uses).to eq 1
    expect(history.aggregate(utc_today..utc_today).uses).to eq 1
  end

  it 'reports the UTC midnight as the day' do
    expect(history.first.as_json[:day]).to eq Time.utc(2026, 10, 28).to_i.to_s
  end

  context 'with an email domain block attempt' do
    let!(:block) { Fabricate(:email_domain_block, domain: 'example.com') }

    it 'counts the attempt over the week' do
      EmailDomainBlock.block?('foo@example.com', attempt_ip: '127.0.0.1')

      expect(block.history.reduce(0) { |sum, day| sum + day.accounts }).to eq 1
    end
  end
end
