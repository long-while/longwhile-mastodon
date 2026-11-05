# frozen_string_literal: true

class ProcessHashtagsService < BaseService
  def call(status, raw_tags = [])
    @status        = status
    @account       = status.account
    @raw_tags      = status.local? ? Extractor.extract_hashtags(status.text) : raw_tags
    @previous_tags = status.tags.to_a
    @current_tags  = []

    assign_tags!
    update_featured_tags!
  end

  private

  def assign_tags!
    @status.tags = @current_tags = Tag.find_or_create_by_names(@raw_tags)
  end

  # distributable?(public/unlisted)로 두면 이 인스턴스에서는 영영 거짓이라 프로필의
  # 추천 해시태그 개수가 멈춘다. 추천 태그는 프로필에서 보이는 것이고 프로필 자체가
  # 팔로워에게만 열리므로, DM 만 빼면 된다.
  def update_featured_tags!
    return if @status.direct_visibility? || @status.limited_visibility?

    added_tags = @current_tags - @previous_tags

    unless added_tags.empty?
      @account.featured_tags.where(tag_id: added_tags.map(&:id)).find_each do |featured_tag|
        featured_tag.increment(@status.created_at)
      end
    end

    removed_tags = @previous_tags - @current_tags

    unless removed_tags.empty?
      @account.featured_tags.where(tag_id: removed_tags.map(&:id)).find_each do |featured_tag|
        featured_tag.decrement(@status)
      end
    end
  end
end
