# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Admin Settings Branding' do
  describe 'When signed in as an admin' do
    before { sign_in Fabricate(:admin_user) }

    describe 'PUT /admin/settings/branding' do
      it 'cannot create a setting value for a non-admin key' do
        expect { put admin_settings_branding_path, params: { form_admin_settings: { new_setting_key: 'New key value' } } }
          .to_not change(Setting, :new_setting_key).from(nil)

        expect(response)
          .to have_http_status(400)
      end
    end

    describe 'text colors' do
      def palette_params(rows)
        { form_admin_settings: { text_color_palette_submitted: '1', text_color_palette: rows } }
      end

      it 'shows the locked default row and the nine default colors' do
        get admin_settings_branding_path

        expect(response).to have_http_status(200)
        page = response.parsed_body
        rows = page.css('.text-color-palette__list > .text-color-palette__row')
        expect(rows.size).to eq 10
        expect(rows.first['class']).to include('text-color-palette__row--locked')
        expect(rows.first.css('input[name]')).to be_empty
        expect(page.css('.text-color-palette__list input[name$="[hex]"]').pick('value')).to eq '7d7a75'
        expect(page.css('.text-color-palette__list input[name$="[name]"]').pick('maxlength')).to eq '12'

        ups = page.css('.text-color-palette__list .text-color-palette__up')
        downs = page.css('.text-color-palette__list .text-color-palette__down')
        expect(ups.map { |button| button.key?('disabled') }).to eq [true] + ([false] * 8)
        expect(downs.map { |button| button.key?('disabled') }).to eq ([false] * 8) + [true]
      end

      it 'guards the form against leaving with unsaved changes and saves from the bottom too' do
        get admin_settings_branding_path

        page = response.parsed_body
        expect(page.at_css('form#edit_admin_settings')['data-unsaved-guard']).to eq 'true'
        expect(page.at_css('.unsaved-changes-toast')).to be_present
        expect(page.at_css('.unsaved-changes-toast').key?('hidden')).to be true
        expect(page.at_css('form#edit_admin_settings .text-color-palette__actions button[type="submit"]')).to be_present
      end

      it 'refuses a name longer than twelve characters, spaces included' do
        put admin_settings_branding_path, params: palette_params('0' => { name: '아주 아주 긴 색상 이름이에요', hex: 'fff' })

        expect(response).to have_http_status(200)
        expect(TextColorPalette.current.size).to eq 9
      end

      it 'saves edited, added and cleaned codes in order' do
        put admin_settings_branding_path, params: palette_params(
          '0' => { name: '빨강', hex: ' # CF5148 ' },
          '17000000000010' => { name: '새 색', hex: '0af' }
        )

        expect(response).to redirect_to(admin_settings_branding_path)
        expect(TextColorPalette.current).to eq [
          { 'name' => '빨강', 'hex' => 'cf5148' },
          { 'name' => '새 색', 'hex' => '0af' },
        ]
      end

      it 'saves an empty palette when every color was removed' do
        put admin_settings_branding_path, params: { form_admin_settings: { text_color_palette_submitted: '1' } }

        expect(response).to redirect_to(admin_settings_branding_path)
        expect(TextColorPalette.current).to eq []
      end

      it 'keeps the old palette and shows the problem for an invalid code' do
        put admin_settings_branding_path, params: palette_params('0' => { name: '빨강', hex: 'zz12' })

        expect(response).to have_http_status(200)
        page = response.parsed_body
        expect(page.css('.text-color-palette__errors li').map(&:text))
          .to eq [I18n.t('admin.settings.text_colors.errors.invalid_hex', position: 1, locale: :ko)]
        expect(page.css('.text-color-palette__list input[name$="[hex]"]').pluck('value')).to eq ['12']
        expect(TextColorPalette.current.size).to eq 9
      end

      it 'refuses more than twelve colors' do
        rows = Array.new(13) { |i| [i.to_s, { name: "c#{i}", hex: 'fff' }] }.to_h

        put admin_settings_branding_path, params: palette_params(rows)

        expect(response).to have_http_status(200)
        expect(TextColorPalette.current.size).to eq 9
      end

      it 'leaves the palette alone when another settings page is saved' do
        Setting.text_color_palette = [{ 'name' => 'ok', 'hex' => 'f00' }]

        put admin_settings_branding_path, params: { form_admin_settings: { site_title: 'Title' } }

        expect(TextColorPalette.current).to eq [{ 'name' => 'ok', 'hex' => 'f00' }]
      end
    end
  end
end
