# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Settings Privacy' do
  let!(:user) { Fabricate(:user) }

  before { sign_in(user) }

  describe 'Managing privacy settings' do
    it 'turns read receipts off' do
      visit settings_privacy_path
      expect(page)
        .to have_content(I18n.t('privacy.title'))
        .and have_private_cache_control

      uncheck read_receipts_field

      expect { click_on submit_button }
        .to change { user.reload.settings['dm_read_receipts'] }.to(false)
      expect(page)
        .to have_content(I18n.t('privacy.title'))
        .and have_content(success_message)
    end
  end

  def read_receipts_field
    form_label('settings.dm_read_receipts')
  end
end
