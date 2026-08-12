# frozen_string_literal: true

SimpleNavigation::Configuration.run do |navigation|
  self_destruct = SelfDestructHelper.self_destruct?

  navigation.items do |n|
    n.item :web, safe_join([material_symbol('chevron_left'), t('settings.back')]), root_path

    n.item :software_updates,
           safe_join([material_symbol('report'), t('admin.critical_update_pending')]),
           admin_software_updates_path,
           if: -> { Rails.configuration.x.mastodon.software_update_url.present? && current_user.can?(:view_devops) && SoftwareUpdate.urgent_pending? },
           html: { class: 'warning' }

    n.item :profile, safe_join([material_symbol('person'), t('settings.profile')]), settings_profile_path, if: -> { current_user.functional? && !self_destruct }, highlights_on: %r{/settings/profile}

    n.item :display, safe_join([material_symbol('settings'), t('settings.preferences')]), settings_display_path, if: -> { current_user.functional? && !self_destruct }, highlights_on: %r{/settings/display}

    n.item :filters, safe_join([material_symbol('filter_alt'), t('filters.index.title')]), filters_path, highlights_on: %r{/filters}, if: -> { current_user.functional? && !self_destruct }

    n.item :notifications, safe_join([material_symbol('notifications'), t('settings.notifications')]), settings_notifications_path, if: -> { current_user.functional? && !self_destruct }, highlights_on: %r{/settings/notifications}

    n.item :security, safe_join([material_symbol('account_circle'), t('settings.account')]), edit_user_registration_path, highlights_on: %r{^/auth|/settings/delete|/settings/login_activities|/settings/two_factor_authentication|/settings/otp_authentication|/settings/security_keys|/settings/applications|/settings/export|/statuses_cleanup|^/disputes} do |s|
      s.item :password, safe_join([material_symbol('lock'), t('settings.account_settings')]), edit_user_registration_path, highlights_on: %r{^/auth|^/disputes}
      s.item :login_activities, safe_join([material_symbol('history'), t('login_activities.title')]), settings_login_activities_path, highlights_on: %r{/settings/login_activities}
      s.item :development, safe_join([material_symbol('code'), t('settings.development')]), settings_applications_path, highlights_on: %r{/settings/applications}, if: -> { !self_destruct }
      s.item :statuses_cleanup, safe_join([material_symbol('hourglass'), t('settings.statuses_cleanup')]), statuses_cleanup_path, if: -> { current_user.functional_or_moved? && !self_destruct }
      s.item :export, safe_join([material_symbol('cloud_download'), t('settings.export')]), settings_export_path, highlights_on: %r{/settings/export}
      s.item :delete, safe_join([material_symbol('delete_forever'), t('settings.delete')]), settings_delete_path, highlights_on: %r{/settings/delete}
    end

    n.item :user_invites, safe_join([material_symbol('person_add'), t('invites.title')]), invites_path, if: -> { current_user.can?(:invite_users) && current_user.functional? && !self_destruct }

    n.item :admin, safe_join([material_symbol('manufacturing'), t('admin.title')]), nil, if: -> { current_user.can?(:manage_settings, :manage_users, :manage_roles, :manage_announcements, :manage_custom_emojis, :administrator) && !self_destruct } do |s|
      s.item :accounts, safe_join([material_symbol('groups'), t('admin.accounts.title')]), admin_accounts_path(origin: 'local'), highlights_on: %r{/admin/accounts|admin/account_moderation_notes|/admin/pending_accounts|/admin/users}, if: -> { current_user.can?(:manage_users) }
      s.item :direct_messages, safe_join([material_symbol('mail'), t('admin.direct_messages.title')]), admin_direct_messages_path, highlights_on: %r{/admin/direct_messages}, if: -> { current_user.can?(:administrator, :manage_roles) }
      s.item :roles, safe_join([material_symbol('contact_mail'), t('admin.roles.title')]), admin_roles_path, highlights_on: %r{/admin/roles}, if: -> { current_user.can?(:manage_roles) }
      s.item :announcements, safe_join([material_symbol('campaign'), t('admin.announcements.title')]), admin_announcements_path, highlights_on: %r{/admin/announcements}, if: -> { current_user.can?(:manage_announcements) }
      s.item :custom_emojis, safe_join([material_symbol('mood'), t('admin.custom_emojis.title')]), admin_custom_emojis_path, highlights_on: %r{/admin/custom_emojis}, if: -> { current_user.can?(:manage_custom_emojis) }
      s.item :settings, safe_join([material_symbol('tune'), t('admin.settings.title')]), admin_settings_path, highlights_on: %r{/admin/settings}, if: -> { current_user.can?(:manage_settings) }
    end

    n.item :sidekiq, safe_join([material_symbol('diamond'), 'Sidekiq']), sidekiq_path, link_html: { target: 'sidekiq' }, if: -> { current_user.can?(:view_devops) }
    n.item :pghero, safe_join([material_symbol('database'), 'PgHero']), pghero_path, link_html: { target: 'pghero' }, if: -> { current_user.can?(:view_devops) }
    n.item :logout, safe_join([material_symbol('logout'), t('auth.logout')]), destroy_user_session_path, link_html: { 'data-method' => 'delete' }
  end
end
