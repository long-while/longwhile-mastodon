# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Parameter log filtering' do # rubocop:disable RSpec/DescribeClass
  subject(:filtered) { ActiveSupport::ParameterFilter.new(Rails.application.config.filter_parameters).filter(params) }

  let(:params) do
    {
      state: 'S', nonce: 'N', code: 'C', code_verifier: 'V', authorization_code: 'A', postcode: '12345',
      payload: { state: 'S2', nonce: 'N2', authorization_code: 'A2' }
    }
  end

  it 'hides the one-time OAuth values, including nested ones' do
    expect(filtered).to include(state: '[FILTERED]', nonce: '[FILTERED]', code: '[FILTERED]', code_verifier: '[FILTERED]', authorization_code: '[FILTERED]')
    expect(filtered[:payload]).to eq(state: '[FILTERED]', nonce: '[FILTERED]', authorization_code: '[FILTERED]')
  end

  it 'leaves keys that merely contain the word alone' do
    expect(filtered[:postcode]).to eq '12345'
  end
end
