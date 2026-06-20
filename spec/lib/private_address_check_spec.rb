# frozen_string_literal: true

require 'rails_helper'

RSpec.describe PrivateAddressCheck do
  describe '.private_address?' do
    # GHSA-crr4-7rm4-8gpw: the IPv6 unspecified address must be treated as private,
    # otherwise it can be used to bypass SSRF protection and reach loopback services.
    it 'returns true for the IPv6 unspecified address ::' do
      expect(described_class.private_address?(IPAddr.new('::'))).to be_truthy
    end

    it 'returns true for the IPv4 unspecified address 0.0.0.0' do
      expect(described_class.private_address?(IPAddr.new('0.0.0.0'))).to be_truthy
    end

    it 'returns true for loopback addresses' do
      expect(described_class.private_address?(IPAddr.new('127.0.0.1'))).to be_truthy
      expect(described_class.private_address?(IPAddr.new('::1'))).to be_truthy
    end

    it 'returns true for unique local addresses' do
      expect(described_class.private_address?(IPAddr.new('fc00::1'))).to be_truthy
    end

    it 'returns false for routable public addresses' do
      expect(described_class.private_address?(IPAddr.new('1.1.1.1'))).to be_falsey
      expect(described_class.private_address?(IPAddr.new('2606:4700:4700::1111'))).to be_falsey
    end
  end
end
