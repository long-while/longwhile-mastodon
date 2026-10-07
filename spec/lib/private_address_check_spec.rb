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

    # GHSA-xfrj-c749-jxxq, GHSA-xx55-4rrg-8xg6, GHSA-vwhj-3g83-v276: IPv4 addresses
    # wrapped in IPv6 (mapped ::ffff:a.b.c.d or compatible ::a.b.c.d) must be
    # judged by the IPv4 address they carry.
    it 'returns true for private IPv4 addresses wrapped in IPv6' do
      expect(%w(::ffff:0.0.0.1 ::127.0.0.1 ::ffff:127.0.0.1 ::ffff:10.0.0.1 ::ffff:100.64.0.1 ::ffff:169.254.169.254))
        .to all satisfy('return true') { |addr| described_class.private_address?(IPAddr.new(addr)) }
    end

    it 'returns true for the RFC 8215 translation and documentation ranges' do
      expect(described_class.private_address?(IPAddr.new('64:ff9b:1::1'))).to be_truthy
      expect(described_class.private_address?(IPAddr.new('3fff::1'))).to be_truthy
    end

    it 'returns false for public IPv4 addresses wrapped in IPv6' do
      expect(described_class.private_address?(IPAddr.new('::ffff:1.1.1.1'))).to be_falsey
    end

    it 'returns false for routable public addresses' do
      expect(described_class.private_address?(IPAddr.new('1.1.1.1'))).to be_falsey
      expect(described_class.private_address?(IPAddr.new('2606:4700:4700::1111'))).to be_falsey
    end
  end
end
