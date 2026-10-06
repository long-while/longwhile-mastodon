# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Admin::Settings::Branding' do
  let(:admin_user) { Fabricate(:admin_user) }

  before { sign_in(admin_user) }

  it 'Saves changes to branding settings' do
    visit admin_settings_branding_path
    expect(page)
      .to have_title(I18n.t('admin.settings.branding.title'))

    fill_in short_description_field,
            with: 'new key value'

    fill_in site_contact_email_field,
            with: User.last.email

    fill_in site_contact_username_field,
            with: Account.last.username

    expect { click_on submit_button }
      .to change(Setting, :site_short_description).to('new key value')

    expect(page)
      .to have_content(success_message)
  end

  describe 'wordmarks' do
    before { visit admin_settings_branding_path }

    it 'shows the bundled wordmark, the required size and a template before anything is uploaded' do
      expect(page)
        .to have_css('img.image-picker__img[data-upload-preview="form_admin_settings_wordmark_dark"][src*="wordmark_dark"]')
        .and have_css('img.wordmark-preview__logo[data-upload-preview="form_admin_settings_wordmark_light"][src*="wordmark_light"]')
        .and have_content(I18n.t('admin.settings.uploads.sizes.wordmark'))
        .and have_css('.image-picker__badge', text: I18n.t('admin.settings.uploads.default'))
        .and have_link(I18n.t('admin.settings.uploads.wordmark_template'), count: 2)
        .and have_css('details.branding-guide .branding-guide__chevron')
        .and have_css('.image-picker__size', text: I18n.t('admin.settings.uploads.sizes.wordmark'), count: 1)
        .and have_css('.branding-wordmark__pair .wordmark-preview', count: 2)
    end

    it 'saves a 340×160 PNG' do
      fill_in_contact_fields
      attach_file 'form_admin_settings_wordmark_dark', Rails.root.join('spec', 'fixtures', 'files', 'wordmark.png'), make_visible: true

      expect { click_on submit_button }
        .to change { SiteUpload.exists?(var: 'wordmark_dark') }.from(false).to(true)
      expect(page)
        .to have_content(success_message)
    end

    it 'rejects an image of another size and says why next to the field' do
      fill_in_contact_fields
      attach_file 'form_admin_settings_wordmark_light', Rails.root.join('spec', 'fixtures', 'files', '600x400.png'), make_visible: true

      expect { click_on submit_button }
        .to_not change(SiteUpload, :count)
      expect(page)
        .to have_css('.image-picker__error', text: '600×400')
    end
  end

  def fill_in_contact_fields
    fill_in site_contact_email_field, with: User.last.email
    fill_in site_contact_username_field, with: Account.last.username
  end

  def short_description_field
    form_label 'form_admin_settings.site_short_description'
  end

  def site_contact_email_field
    form_label 'form_admin_settings.site_contact_email'
  end

  def site_contact_username_field
    form_label 'form_admin_settings.site_contact_username'
  end
end
