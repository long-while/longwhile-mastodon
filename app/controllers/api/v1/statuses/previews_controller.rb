# frozen_string_literal: true

class Api::V1::Statuses::PreviewsController < Api::BaseController
  before_action -> { doorkeeper_authorize! :write, :'write:statuses' }
  before_action :require_user!

  MAX_MENTION_LOOKUPS = 30

  def create
    text = params[:status].to_s
    spoiler_text = params[:spoiler_text].to_s

    raise Mastodon::ValidationError, I18n.t('statuses.preview_over_limit', max: input_limit) if text.length + spoiler_text.length > input_limit

    render json: {
      content: formatted(text),
      spoiler_text: spoiler_text,
    }
  end

  private

  def input_limit
    StatusLengthValidator.max_chars * 2
  end

  def formatted(text)
    TextFormatter.new(text, multiline: true, preloaded_accounts: mentionable_accounts(text), strict_mentions: true).to_s
  end

  def mentionable_accounts(text)
    handles  = TextFormatter.new(text).entities.filter_map { |entity| entity[:screen_name] }.uniq.first(MAX_MENTION_LOOKUPS)
    accounts = handles.filter_map { |handle| find_mentionable(handle) }

    reject_blocked(accounts)
  end

  def find_mentionable(handle)
    username, domain = handle.split('@', 2)
    domain = TagManager.instance.local_domain?(domain) ? nil : TagManager.instance.normalize_domain(domain)
    account = Account.find_remote(username, domain)

    account if account && mentionable?(account)
  end

  def mentionable?(account)
    return false if account.unavailable?
    return account.user_confirmed? && account.user_approved? if account.local?

    account.activitypub?
  end

  def reject_blocked(accounts)
    return accounts if accounts.empty?

    ids = accounts.map(&:id)
    hidden_ids = Block.where(account_id: ids, target_account_id: current_account.id).pluck(:account_id) +
                 current_account.block_relationships.where(target_account_id: ids).pluck(:target_account_id)
    hidden_domains = current_account.domain_blocks.where(domain: accounts.filter_map(&:domain)).pluck(:domain)

    accounts.reject { |account| hidden_ids.include?(account.id) || hidden_domains.include?(account.domain) }
  end
end
