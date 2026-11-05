# frozen_string_literal: true

require 'rails_helper'

RSpec.describe DateOfBirthValidator do
  subject { Fabricate.build :user }

  before { Setting.min_age = 16 }

  context 'with an invalid date' do
    let(:invalid_date) { '76.830.10' }

    it { is_expected.to_not allow_values(invalid_date).for(:date_of_birth).with_message(:blank) }
  end

  context 'with a date below the age limit' do
    let(:too_young) { 13.years.ago }

    it { is_expected.to_not allow_values(too_young).for(:date_of_birth).with_message(:below_limit) }
  end

  context 'with a date above the age limit' do
    let(:old_enough) { 16.years.ago }

    it { is_expected.to allow_values(old_enough).for(:date_of_birth) }
  end

  # Time.zone 이 Asia/Seoul 이면 서울 0시~9시 사이에 날짜(UTC 0시로 바뀐다)와 시각을
  # 비교해서, 오늘 딱 16세가 된 사람이 "나이 미달" 이 되던 것의 회귀 예제.
  context 'when it is early morning in the instance time zone' do
    around do |example|
      Time.use_zone('Asia/Seoul') { example.run }
    end

    before { travel_to(Time.utc(2026, 10, 23, 21, 0, 0)) }

    it { is_expected.to allow_values(Date.new(2010, 10, 24)).for(:date_of_birth) }
    it { is_expected.to_not allow_values(Date.new(2010, 10, 25)).for(:date_of_birth).with_message(:below_limit) }
  end
end
