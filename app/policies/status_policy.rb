# frozen_string_literal: true

class StatusPolicy < ApplicationPolicy
  def show?
    # An anonymised author is unavailable as a person but its posts are kept on
    # purpose, so only a real suspension hides them.
    return false if author.unavailable? && !author.anonymized?
    return true if administrator?

    return false if record.reblog? && !owned? && !reblogged_status_visible?
    return false if record.reblog? && owned? && reblogged_author_blocking?

    if requires_mention?
      owned? || mention_exists?
    elsif announcement?
      !current_account.nil? && !author_blocking?
    elsif private? || unlisted?
      owned? || following_author? || mention_exists?
    else
      current_account.nil? || (!author_blocking? && !author_blocking_domain?)
    end
  end

  def quote?
    show? && !blocking_author? && record.quote_policy_for_account(current_account) != :denied
  end

  def reblog?
    !author.anonymized? && !requires_mention? && show? && !blocking_author?
  end

  def favourite?
    !author.anonymized? && show? && !blocking_author?
  end

  def destroy?
    owned?
  end

  alias unreblog? destroy?

  def update?
    owned?
  end

  private

  def requires_mention?
    record.direct_visibility? || record.limited_visibility?
  end

  def reblogged_status_visible?
    original = record.reblog
    return false if original.nil?

    StatusPolicy.new(current_account, original).show?
  end

  def reblogged_author_blocking?
    original_author = record.reblog&.account
    return false if original_author.nil? || current_account.nil?

    original_author.blocking?(current_account)
  end

  def owned?
    author.id == current_account&.id
  end

  def private?
    record.private_visibility?
  end

  def unlisted?
    record.unlisted_visibility?
  end

  def announcement?
    unlisted? && author.announcement_account?
  end

  def mention_exists?
    return false if current_account.nil?

    if record.mentions.loaded?
      record.mentions.any? { |mention| mention.account_id == current_account.id }
    else
      record.mentions.exists?(account: current_account)
    end
  end

  def author_blocking_domain?
    return false if current_account.nil? || current_account.domain.nil?

    author.domain_blocking?(current_account.domain)
  end

  def blocking_author?
    return false if current_account.nil?

    current_account.blocking?(author)
  end

  def author_blocking?
    return false if current_account.nil?

    current_account.blocked_by?(author)
  end

  def following_author?
    return false if current_account.nil?

    current_account.following?(author)
  end

  def author
    record.account
  end

  def administrator?
    current_account&.user&.functional? && current_account.user.can?(:administrator, :manage_roles)
  end
end
