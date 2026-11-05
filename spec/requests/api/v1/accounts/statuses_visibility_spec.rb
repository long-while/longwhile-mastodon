# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'GET /api/v1/accounts/:id/statuses visibility' do
  let(:author) { Fabricate(:account) }
  let!(:public_status) { Fabricate(:status, account: author, visibility: :public) }
  let!(:unlisted_status) { Fabricate(:status, account: author, visibility: :unlisted) }
  let!(:private_status) { Fabricate(:status, account: author, visibility: :private) }
  let!(:direct_status) { Fabricate(:status, account: author, visibility: :direct) }

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
