# frozen_string_literal: true

ENV['VIPS_BLOCK_UNTRUSTED'] = 'true'

require 'vips'

unless Vips.at_least_libvips?(8, 13)
  abort <<~ERROR.squish # rubocop:disable Rails/Exit
    Incompatible libvips version (#{Vips.version_string}), please install libvips >= 8.13
  ERROR
end

Vips.block('VipsForeign', true)

# @_longwhile 업스트림은 HEIF 로더를 막지만 우리는 연다. 아이폰은 사진을 HEIC 로 올리고
# (작성창이 IMAGE_MIME_TYPES 의 image/heic 을 받는다), 막으면 업로드가 500 이 된다.
# 운영은 원래 ImageMagick 이 같은 libheif 로 HEIC·AVIF 를 읽어 왔으므로 공격면이 늘지 않는다.
# heifload 는 untrusted 표시가 없어 아래 block_untrusted 에도 막히지 않는다.
%w(
  VipsForeignLoadNsgif
  VipsForeignLoadJpeg
  VipsForeignLoadPng
  VipsForeignLoadWebp
  VipsForeignLoadHeif
  VipsForeignSavePng
  VipsForeignSaveSpng
  VipsForeignSaveJpeg
  VipsForeignSaveWebp
).each do |operation|
  Vips.block(operation, false)
end

Vips.block_untrusted(true)

# In some places of the code, we rescue this exception, but we don't always
# load libvips, so it may be an undefined constant:
unless defined?(Vips)
  module Vips
    class Error < StandardError; end
  end
end
