# frozen_string_literal: true

require 'rails_helper'

# 운영진 열람(StatusPolicy#administrator?)은 남의 비공개 글과 DM 까지 열어 준다.
# 로그인이 비활성화된(disabled) 운영진 계정의 토큰으로는 그 권한이 남으면 안 된다
# (보안 회귀 스펙). 업스트림 정책들은 ApplicationPolicy#role 로 이것을 막는다.
RSpec.describe StatusPolicy, '#show?' do
  let(:admin) { Fabricate(:admin_user).account }
  let(:direct_status) { Fabricate(:status, visibility: :direct) }
  let(:private_status) { Fabricate(:status, visibility: :private) }

  it 'lets an administrator read direct and private statuses' do
    expect(described_class.new(admin, direct_status).show?).to be true
    expect(described_class.new(admin, private_status).show?).to be true
  end

  context 'when the administrator login is disabled' do
    before { admin.user.disable! }

    it 'does not grant the administrator view' do
      expect(described_class.new(admin, direct_status).show?).to be false
      expect(described_class.new(admin, private_status).show?).to be false
    end

    it 'does not grant the administrator view of profiles' do
      Fabricate(:status, account: private_status.account, visibility: :direct)

      results = AccountStatusesFilter.new(private_status.account, admin).results
      expect(results.pluck(:visibility).uniq - %w(public)).to be_empty
    end
  end
end
