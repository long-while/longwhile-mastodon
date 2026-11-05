# frozen_string_literal: true

class PublicFeed
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
    return [] if incompatible_feed_settings?

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

  def incompatible_feed_settings?
    (local_only? && !user_has_access_to_feed?(local_feed_setting)) || (remote_only? && !user_has_access_to_feed?(remote_feed_setting))
  end

  def user_has_access_to_feed?(setting)
    case setting
    when 'public'
      true
    when 'authenticated'
      @account&.user&.functional?
    when 'disabled'
      @account&.user&.can?(:view_feeds)
    end
  end

  def with_reblogs?
    options[:with_reblogs]
  end

  def with_replies?
    options[:with_replies]
  end

  def local_feed_setting
    Setting.local_live_feed_access
  end

  def remote_feed_setting
    Setting.remote_live_feed_access
  end

  def local_only?
    (options[:local] && !options[:remote]) || !user_has_access_to_feed?(remote_feed_setting)
  end

  def remote_only?
    (options[:remote] && !options[:local]) || !user_has_access_to_feed?(local_feed_setting)
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

  WITHOUT_MENTIONS_SQL = <<~SQL.squish
    NOT EXISTS (
      SELECT 1 FROM mentions
      WHERE mentions.silent = FALSE
        AND (mentions.status_id = statuses.id OR mentions.status_id = statuses.reblog_of_id)
    )
  SQL
  private_constant :WITHOUT_MENTIONS_SQL

  def standard_public_scope(base_scope)
    scope = visible_authors_scope(base_scope)
            .where(
              visibility: [Status.visibilities.fetch('private'), Status.visibilities.fetch('unlisted')]
            )
            .where(reblog_author_visible_sql)

    exclude_mentioning_statuses? ? scope.where(WITHOUT_MENTIONS_SQL) : scope
  end

  def administrator_public_scope(base_scope)
    mentioned_ids = Mention.active.where(account_id: account.id).select(:status_id)

    scope = visible_authors_scope(base_scope)
            .where(
              visibility: [
                Status.visibilities.fetch('private'),
                Status.visibilities.fetch('unlisted'),
              ]
            )
            .where.not(id: mentioned_ids)

    exclude_mentioning_statuses? ? scope.where(WITHOUT_MENTIONS_SQL) : scope
  end

  def exclude_mentioning_statuses?
    true
  end

  def visible_authors_scope(base_scope)
    base_scope.where(visible_authors_sql)
  end

  def visible_authors_sql
    author_visible_sql('statuses')
  end

  def reblog_author_visible_sql
    <<~SQL.squish
      (statuses.reblog_of_id IS NULL OR EXISTS (
        SELECT 1 FROM statuses AS reblogged_statuses
        WHERE reblogged_statuses.id = statuses.reblog_of_id
          AND #{author_visible_sql('reblogged_statuses')}
      ))
    SQL
  end

  def visible_author_ids_sql
    @visible_author_ids_sql ||= Account
                                .where(id: followed_ids)
                                .or(Account.where(id: visible_account_ids))
                                .select(:id)
                                .to_sql
  end

  def author_visible_sql(table)
    condition = "#{table}.account_id IN (#{visible_author_ids_sql})"
    return condition if announcement_account_id.nil?

    announcement = "#{table}.account_id = #{announcement_account_id.to_i} AND #{table}.visibility = #{Status.visibilities.fetch('unlisted')}"

    "(#{condition} OR (#{announcement}))"
  end

  def announcement_account_id
    return @announcement_account_id if defined?(@announcement_account_id)

    @announcement_account_id = self.class.announcement_account_id
  end

  def followed_ids
    @followed_ids ||= Follow.where(account_id: account.id).select(:target_account_id)
  end

  def visible_account_ids
    @visible_account_ids ||= [account.id]
  end

  def administrator?
    account&.user&.functional? && account.user.can?(:administrator, :manage_roles)
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
