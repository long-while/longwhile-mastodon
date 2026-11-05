# frozen_string_literal: true

class UserSettings
  class Error < StandardError; end
  class KeyError < Error; end

  include UserSettings::DSL
  include UserSettings::Glue

  setting :always_send_emails, default: false
  setting :aggregate_reblogs, default: true
  setting :theme, default: -> { ::Setting.theme }
  setting :noindex, default: -> { ::Setting.noindex }
  setting :show_application, default: true
  setting :default_language, default: nil
  setting :default_sensitive, default: false
  # 일반 툿의 공개 범위는 private 하나뿐이다 — 작성란에 선택지가 없고,
  # 팔로워 전용이 이 인스턴스의 유일한 기본값이다. DM 은 별도 화면이 담당한다.
  # 저장된 값은 아무도 읽지 않는다 (User#setting_default_privacy 가 무시한다).
  # unlisted 를 허용해 두는 건 공지 계정이 자기 값을 되쓸 때 422 가 나지 않게 하려는 것뿐이다.
  setting :default_privacy, default: 'private', in: %w(private unlisted)
  setting :default_quote_policy, default: 'public', in: %w(public followers nobody)
  setting :email_subscriptions, default: false

  # @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
  #   읽음 표시. 켜면 내가 어디까지 읽었는지가 방의 다른 참여자에게 보인다.
  #
  #   **상호주의다 (FR-19).** 끄면 내 것이 안 보이는 동시에 상대 것도 안 보인다.
  #   그래서 켜 두어도 일방적으로 관찰당하지 않는다 — 보려면 내 것도 보여야 한다.
  #   그 대칭이 기본값을 켬으로 둘 수 있는 근거다 (OI-05, phase-4 §7).
  #
  #   네임스페이스에 넣지 않는다. web: 는 웹 UI 표시이고 interactions: 는 수신
  #   제한인데, 이건 **내 상태를 남에게 알릴지**를 정하는 프라이버시 설정이다.
  #   근거: docs/dm-chat/phases/dm-chat-phase-4.md §2.1
  setting :dm_read_receipts, default: true

  setting_inverse_alias :indexable, :noindex

  namespace :web do
    setting :advanced_layout, default: false
    setting :trends, default: true
    setting :use_blurhash, default: true
    setting :use_pending_items, default: false
    setting :use_system_font, default: false
    setting :use_system_scrollbars, default: false
    setting :disable_swiping, default: false
    setting :disable_hover_cards, default: false
    setting :delete_modal, default: true
    setting :reblog_modal, default: false
    setting :quick_boosting, default: false
    # @_longwhile — 설정 화면에서 걷어냈으므로 기본을 끔으로 둔다.
    # 켬으로 두면 확인창을 끌 방법이 없어진다 (settings-phase-2.md §1.3).
    setting :missing_alt_text_modal, default: false
    setting :reduce_motion, default: false
    setting :expand_content_warnings, default: false
    setting :display_media, default: 'default', in: %w(hide_all default show_all)
    setting :auto_play, default: false
    setting :emoji_style, default: 'auto', in: %w(auto native twemoji)
    setting :color_scheme, default: 'auto', in: %w(auto light dark)
    setting :contrast, default: 'auto', in: %w(auto high)
  end

  namespace :notification_emails do
    setting :follow, default: false
    setting :reblog, default: false
    setting :favourite, default: false
    setting :mention, default: false
    setting :quote, default: false
    setting :follow_request, default: false
    setting :report, default: false
    setting :pending_account, default: false
    setting :trends, default: false
    setting :appeal, default: false
    setting :software_updates, default: 'critical', in: %w(none critical patch all)
    setting :end_of_support, default: true
  end

  def initialize(original_hash)
    @original_hash = original_hash || {}
  end

  def [](key)
    definition = self.class.definition_for(key)

    raise KeyError, "Undefined setting: #{key}" if definition.nil?

    definition.value_for(key, @original_hash[definition.key])
  end

  def []=(key, value)
    definition = self.class.definition_for(key)

    raise KeyError, "Undefined setting: #{key}" if definition.nil?

    typecast_value = definition.type_cast(value)

    raise ArgumentError, "Invalid value for setting #{definition.key}: #{typecast_value}" if definition.in.present? && definition.in.exclude?(typecast_value)

    if typecast_value.nil?
      @original_hash.delete(definition.key)
    else
      @original_hash[definition.key] = definition.value_for(key, typecast_value)
    end
  end

  def update(params)
    params.each do |k, v|
      self[k] = v unless v.nil?
    end
  end

  keys.each do |key|
    define_method(key) do
      self[key]
    end
  end

  def as_json
    @original_hash
  end
end
