# frozen_string_literal: true

class PublicFeed
  # 공지용 계정: 해당 계정의 unlisted(로컬 범위) 툿은 팔로우 여부와 무관하게 노출됨
  ANNOUNCEMENT_USERNAME = 'longwhile'

  # @param [Account] account
  # @param [Hash] options
  # @option [Boolean] :with_replies
  # @option [Boolean] :with_reblogs
  # @option [Boolean] :local
  # @option [Boolean] :remote
  # @option [Boolean] :only_media
  def initialize(account, options = {})
    @account = account
    @options = options
  end

  def self.announcement_account
    Account.find_by(username: ANNOUNCEMENT_USERNAME, domain: nil)
  end

  def self.announcement_account_id
    announcement_account&.id
  end

  # @param [Integer] limit
  # @param [Integer] max_id
  # @param [Integer] since_id
  # @param [Integer] min_id
  # @return [Array<Status>]
  def get(limit, max_id = nil, since_id = nil, min_id = nil)
    scope = public_scope

    scope.merge!(without_replies_scope) unless with_replies?
    scope.merge!(without_reblogs_scope) unless with_reblogs?
    scope.merge!(local_only_scope) if local_only?
    scope.merge!(remote_only_scope) if remote_only?
    scope.merge!(account_filters_scope) if account?
    scope.merge!(media_only_scope) if media_only?
    scope.merge!(language_scope) if account&.chosen_languages.present?

    scope.to_a_paginated_by_id(limit, max_id: max_id, since_id: since_id, min_id: min_id)
  end

  private

  attr_reader :account, :options

  def with_reblogs?
    options[:with_reblogs]
  end

  def with_replies?
    options[:with_replies]
  end

  def local_only?
    options[:local] && !options[:remote]
  end

  def remote_only?
    options[:remote] && !options[:local]
  end

  def account?
    account.present?
  end

  def media_only?
    options[:only_media]
  end

  def public_scope
    base_scope = Status.joins(:account).merge(Account.without_suspended.without_silenced)

    return base_scope.none unless account?

    administrator? ? administrator_public_scope(base_scope) : standard_public_scope(base_scope)
  end

  # 일반 사용자: 팔로우 중 + 본인 계정 + 공지용 계정(@longwhile)의 툿 노출
  # - 비잠금(언프로텍트) 작성자: unlisted 만
  # - 잠금(프로텍트) 작성자: unlisted + private
  #   (본인의 private 도 본인 계정이 잠금 상태일 때만 자연스럽게 노출됨)
  # 공지용 계정의 unlisted(로컬 범위) 툿은 팔로우 여부와 무관하게 항상 노출됨
  # enum 키가 사라지면 fetch가 즉시 KeyError로 실패 → 마이그레이션 누락을 빠르게 감지
  def standard_public_scope(base_scope)
    followed_ids = Follow.where(account_id: account.id).select(:target_account_id)
    visible_account_ids = [account.id, self.class.announcement_account_id].compact

    base_scope
      .where('statuses.account_id IN (?) OR statuses.account_id IN (?)', followed_ids, visible_account_ids)
      .where(
        '(statuses.visibility = ?) OR (statuses.visibility = ? AND accounts.locked = TRUE)',
        Status.visibilities.fetch('unlisted'),
        Status.visibilities.fetch('private')
      )
  end

  # Admin / Owner: 팔로우 중 + 본인 계정 + 공지용 계정(@longwhile)의 툿 노출 (감시 목적)
  # - 비잠금 작성자: unlisted + direct
  # - 잠금(프로텍트) 작성자: unlisted + private + direct
  # - 본인이 멘션된 툿은 제외 (이미 멘션/알림 타임라인에서 확인 가능)
  def administrator_public_scope(base_scope)
    followed_ids       = Follow.where(account_id: account.id).select(:target_account_id)
    mentioned_ids      = Mention.where(account_id: account.id).select(:status_id)
    visible_account_ids = [account.id, self.class.announcement_account_id].compact

    base_scope
      .where('statuses.account_id IN (?) OR statuses.account_id IN (?)', followed_ids, visible_account_ids)
      .where(
        '(statuses.visibility IN (?, ?)) OR (statuses.visibility = ? AND accounts.locked = TRUE)',
        Status.visibilities.fetch('unlisted'),
        Status.visibilities.fetch('direct'),
        Status.visibilities.fetch('private')
      )
      .where.not(id: mentioned_ids)
  end

  def administrator?
    account&.user&.can?(:administrator, :manage_roles)
  end

  def local_only_scope
    Status.local
  end

  def remote_only_scope
    Status.remote
  end

  def without_replies_scope
    Status.without_replies
  end

  def without_reblogs_scope
    Status.without_reblogs
  end

  def media_only_scope
    Status.joins(:media_attachments).group(:id)
  end

  def language_scope
    Status.where(language: account.chosen_languages)
  end

  def account_filters_scope
    Status.not_excluded_by_account(account).tap do |scope|
      scope.merge!(Status.not_domain_blocked_by_account(account)) unless local_only?
    end
  end
end
