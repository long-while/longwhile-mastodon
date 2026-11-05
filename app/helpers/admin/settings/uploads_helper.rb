# frozen_string_literal: true

# @_longwhile — 서버 설정의 그림 올리기(admin/settings/shared/_upload).
# 아직 올린 것이 없는 칸에도 지금 실제로 쓰이는 기본 그림을 보여 준다.
module Admin::Settings::UploadsHelper
  PREVIEW_STYLES = {
    thumbnail: :'@1x',
    favicon: '48',
    app_icon: '48',
  }.freeze

  DEFAULT_ASSETS = {
    thumbnail: 'images/preview.png',
    favicon: 'icons/favicon-48x48.png',
    app_icon: 'icons/apple-touch-icon-180x180.png',
    mascot: 'images/elephant_ui_plane.svg',
  }.freeze

  # 저장에 실패해 다시 그린 화면에서는 upload 에 아직 저장되지 않은 파일이
  # 붙어 있다. 그 URL 은 존재하지 않으므로 저장된 그림이 있을 때만 돌려준다.
  def site_upload_preview_url(upload)
    return if upload.nil? || !upload.persisted? || upload.changed?

    style = PREVIEW_STYLES[upload.var.to_sym]
    style ? upload.file.url(style) : upload.file.url
  end

  def site_upload_default_url(var)
    path = site_upload_default_asset(var)
    frontend_asset_path(path) if path
  end

  # 브라우저가 고르는 즉시 검사할 조건(entrypoints/admin.tsx). 서버 검사
  # (SiteUpload#validate_wordmark_file)와 같은 값·같은 문구를 쓴다.
  def wordmark_input_data
    width, height = SiteUpload::WORDMARK_SIZE
    scope = 'activerecord.errors.models.site_upload.attributes.file'

    {
      expected_width: width,
      expected_height: height,
      tolerance: SiteUpload::WORDMARK_TOLERANCE,
      allowed_types: SiteUpload::WORDMARK_MIME_TYPES.join(','),
      type_error: t("#{scope}.wordmark_content_type"),
      size_error: t("#{scope}.wordmark_dimensions", width: width, height: height, tolerance: SiteUpload::WORDMARK_TOLERANCE, actual: '{actual}'),
    }
  end

  def site_upload_default_asset(var)
    return DEFAULT_ASSETS[var.to_sym] unless SiteUpload::WORDMARK_VARS.include?(var.to_s)

    folder = Setting.theme.to_s.start_with?('theme-ui') ? 'theme' : 'logos'
    "images/#{folder}/#{var}.png"
  end
end
