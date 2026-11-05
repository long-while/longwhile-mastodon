# frozen_string_literal: true

SimpleNavigation::Configuration.run do |navigation|
  self_destruct = SelfDestructHelper.self_destruct?

  navigation.items do |n|
    n.item :web, safe_join([material_symbol('chevron_left'), t('settings.back')]), root_path

    n.item :software_updates,
           safe_join(
             SoftwareUpdate.urgent_pending? ? [material_symbol('report'), t('admin.critical_update_pending')] : [material_symbol('system_update_alt'), t('admin.update_available')]
           ),
           admin_software_updates_path,
           html: { class: SoftwareUpdate.urgent_pending? || SoftwareDeprecation.current&.unsupported? ? 'warning' : nil },
           if: -> { Rails.configuration.x.mastodon.software_update_url.present? && current_user.can?(:view_devops) && SoftwareUpdate.pending? }

    # ─── @_longwhile — 사용자 설정 사이드바 (settings-phase-5.md §1) ───
    # 상위 아홉을 다섯으로 줄였다. 기준은 "원하는 결과 하나 = 화면 하나" 다.
    #
    # 하위 항목은 상위가 활성일 때만 그려진다. 그래서 계정 아래 넷은 이동
    # 수단이고 **입구는 계정 화면 본문**이다 (Phase 4 에서 넣었다).
    #
    # 여기 순서가 곧 화면 순서다. 설정 사이드바는 웹앱 좌측 내비와 달리
    # flex order 를 쓰지 않는다 — DECISIONS A-44.
    n.item :profile, safe_join([material_symbol('person'), t('settings.profile')]), settings_profile_path, if: -> { current_user.functional? && !self_destruct }, highlights_on: %r{/settings/profile}

    n.item :display, safe_join([material_symbol('settings'), t('settings.preferences')]), settings_display_path, if: -> { current_user.functional? && !self_destruct }, highlights_on: %r{/settings/display}

    # @_longwhile — 뮤트한 단어는 화면 하위였다. 하위가 둘뿐이면 사이드바가
    # 두 칸으로 벌어지기만 하고 얻는 게 없어 상위로 뺐다. 화면 바로 뒤에
    # 두어 "보이는 것을 손보는 곳" 이라는 짝은 유지한다.
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

    # ─── @_longwhile — 운영 메뉴 하나 (DECISIONS A-54 · A-55) ───
    # 중재와 관리 둘로 갈려 있던 것을 "운영" 하나로 합쳤다. 실제로 쓰는 것이
    # 여섯뿐이라 두 묶음으로 나눌 이유가 없었다 — 나눠 두면 무엇이 어느 쪽에
    # 있는지 기억해야 하고, 그것이 곧 한 번 더 누르는 일이 된다.
    #
    # **화면과 라우트는 하나도 지우지 않았다.** 여기 없는 관리자 화면은 주소를
    # 직접 치면 그대로 열린다. 뺀 항목과 되살리는 줄은 A-54 에 있다.
    #
    # **신고는 사이드바에서 닿지 않는다.** /admin 을 즐겨찾기에 둘 것 —
    # 대시보드에 미해결 신고 수가 보인다.
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
