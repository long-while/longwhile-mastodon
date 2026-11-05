# frozen_string_literal: true

class REST::CredentialAccountSerializer < REST::AccountSerializer
  attributes :source

  has_one :role, serializer: REST::RoleSerializer

  def source
    user = object.user

    {
      privacy: user.setting_default_privacy,
      sensitive: user.setting_default_sensitive,
      language: user.setting_default_language,
      note: object.note,
      fields: object.fields.map(&:to_h),
      follow_requests_count: Account.without_suspended.joins(:follow_requests).where(follow_requests: { target_account: object }).limit(40).count,
      hide_collections: object.hide_collections,
      discoverable: object.discoverable,
      indexable: object.indexable,
      attribution_domains: object.attribution_domains,

      # @_longwhile — DM 읽음 표시 (docs/dm-chat/phases/dm-chat-phase-4.md §2.1).
      # 프론트가 이 값으로 설정 상태를 알고, 꺼져 있으면 상대 읽음도 그리지
      # 않는다. **그건 보조일 뿐이다** — 실제 차단은 서버가 한다(FR-19).
      dm_read_receipts: user.settings['dm_read_receipts'],
      quote_policy: user.setting_default_quote_policy,
    }
  end

  def role
    object.user_role
  end
end
