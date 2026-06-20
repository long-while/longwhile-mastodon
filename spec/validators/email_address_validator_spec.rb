# frozen_string_literal: true

require 'rails_helper'

RSpec.describe EmailAddressValidator do
  let(:record_class) do
    Class.new do
      include ActiveModel::Validations
      attr_accessor :email

      validates :email, email_address: true
    end
  end
  let(:record) { record_class.new }

  describe '#validate_each' do
    context 'with a well-formed address' do
      it 'does not add errors' do
        record.email = 'foo@example.com'

        expect(record).to be_valid
        expect(record.errors).to be_empty
      end
    end

    # GHSA-5r37-qpwq-2jhh: characters reinterpreted by some mail servers must be rejected,
    # otherwise e-mail domain allow/block lists can be bypassed at sign-up.
    ['foo%bar@example.com', 'foo,bar@example.com', 'foo"bar@example.com', '"foo"@example.com'].each do |bad_email|
      context "with the disallowed-character address #{bad_email}" do
        it 'adds errors' do
          record.email = bad_email

          expect(record).to_not be_valid
          expect(record.errors.first.attribute).to eq(:email)
          expect(record.errors.first.type).to eq(:invalid)
        end
      end
    end
  end
end
