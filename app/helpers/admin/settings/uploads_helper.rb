# frozen_string_literal: true

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

  def site_upload_preview_url(upload)
    return if upload.nil? || !upload.persisted? || upload.changed?

    style = PREVIEW_STYLES[upload.var.to_sym]
    style ? upload.file.url(style) : upload.file.url
  end

  def site_upload_default_url(var)
    path = site_upload_default_asset(var)
    frontend_asset_path(path) if path
  end

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

  def half_set_wordmark(settings)
    stored, missing = SiteUpload::WORDMARK_VARS.partition { |var| site_upload_preview_url(settings.public_send(var)) }
    missing.first if stored.one?
  end

  def site_upload_default_asset(var)
    return DEFAULT_ASSETS[var.to_sym] unless SiteUpload::WORDMARK_VARS.include?(var.to_s)

    folder = Setting.theme.to_s.start_with?('theme-ui') ? 'theme' : 'logos'
    "images/#{folder}/#{var}.png"
  end
end
