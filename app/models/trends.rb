# frozen_string_literal: true

module Trends
  def self.table_name_prefix
    'trends_'
  end

  def self.links
    @links ||= Trends::Links.new
  end

  def self.tags
    @tags ||= Trends::Tags.new
  end

  def self.statuses
    @statuses ||= Trends::Statuses.new
  end

  def self.register!(status)
    [links, tags, statuses].each { |trend_type| trend_type.register(status) }
  end

  def self.refresh!
    [links, tags, statuses].each(&:refresh)
  end

  # @_longwhile — 유행 검토 화면(/admin/trends/*)을 걷어냈다. 검토 대기 표시는
  # 계속 붙지만(다른 코드가 그 상태를 읽는다) 알리는 메일은 보내지 않는다 —
  # 메일 본문의 링크가 갈 곳이 없고, 이 서버는 SMTP 도 없다.
  def self.request_review!
    return if skip_review? || !enabled?

    links.request_review
    tags.request_review
    statuses.request_review

    nil
  end

  def self.enabled?
    Setting.trends
  end

  def self.skip_review?
    Setting.trendable_by_default
  end

  def self.available_locales
    @available_locales ||= I18n.available_locales.map { |locale| locale.to_s.split(/[_-]/).first }.uniq
  end
end
