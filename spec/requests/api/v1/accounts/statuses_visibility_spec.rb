# frozen_string_literal: true

require 'rails_helper'

# 프로필 글 목록이 보는 사람에게 허락된 공개 범위만 내주는지 본다(보안 회귀 스펙).
RSpec.describe 'GET /api/v1/accounts/:id/statuses visibility' do
  let(:author) { Fabricate(:account) }
  let!(:public_status) { Fabricate(:status, account: author, visibility: :public) }
  let!(:unlisted_status) { Fabricate(:status, account: author, visibility: :unlisted) }
  let!(:private_status) { Fabricate(:status, account: author, visibility: :private) }
  let!(:direct_status) { Fabricate(:status, account: author, visibility: :direct) }

  # 비로그인 API 접근을 막지 않는 설정(LIMITED_FEDERATION_MODE 꺼짐)에서도 새면 안 된다.
  context 'without a token' do
    it 'returns only public statuses' do
      get "/api/v1/accounts/#{author.id}/statuses"

      expect(response).to have_http_status(200)
      expect(response.parsed_body.pluck(:id)).to contain_exactly(public_status.id.to_s)
    end

    it 'returns no direct statuses even when asked for them' do
      get "/api/v1/accounts/#{author.id}/statuses", params: { only_direct: true }

      expect(response.parsed_body.pluck(:id)).to_not include(direct_status.id.to_s, private_status.id.to_s, unlisted_status.id.to_s)
    end
  end
end
