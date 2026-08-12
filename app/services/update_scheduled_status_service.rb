# frozen_string_literal: true

# Updates a scheduled status in place, including its body, so a user can fix a
# typo without losing the record's id (and without risking the daily limit
# rejecting a delete-then-recreate).
#
# Only the keys present in +options+ are touched; everything else stays as it was
# stored by PostStatusService. A key present with a nil or empty value is an
# explicit removal — that is how the poll and the attachments get cleared.
class UpdateScheduledStatusService < BaseService
  CONTENT_KEYS = %i(text spoiler_text sensitive visibility language in_reply_to_id poll media_ids).freeze

  def call(scheduled_status, options = {})
    @scheduled_status = scheduled_status
    @account          = scheduled_status.account
    @options          = options.to_h.symbolize_keys

    # Editing while a worker is mid-publication would silently lose the edit: the
    # worker publishes the old content and then destroys the record.
    raise Mastodon::ValidationError, I18n.t('scheduled_statuses.publishing_in_progress') if @scheduled_status.publishing?

    ApplicationRecord.transaction do
      resolve_media!
      validate_as_status!

      @scheduled_status.assign_attributes(next_attributes)
      # Editing counts as a fresh attempt: drop any recorded failure and let the
      # model re-enqueue publication.
      @scheduled_status.failed_at     = nil
      @scheduled_status.last_error    = nil
      @scheduled_status.publishing_at = nil
      @scheduled_status.save!

      reattach_media!
    end

    # The association may have been loaded before the re-link above.
    @scheduled_status.media_attachments.reset

    @scheduled_status
  end

  private

  def content_change?
    CONTENT_KEYS.any? { |key| @options.key?(key) }
  end

  def stored_params
    @scheduled_status.params.presence || {}
  end

  def next_params
    @next_params ||= stored_params.with_indifferent_access.tap do |params|
      CONTENT_KEYS.each do |key|
        params[key] = @options[key] if @options.key?(key)
      end

      params[:media_ids]    = @media.map(&:id) if @options.key?(:media_ids)
      params[:scheduled_at] = nil
      params[:idempotency]  = nil
    end
  end

  def next_attributes
    attributes = {}
    attributes[:scheduled_at] = @options[:scheduled_at] if @options.key?(:scheduled_at)
    attributes[:params]       = next_params if content_change?
    attributes
  end

  def media_ids
    @media_ids ||= Array(@options[:media_ids]).map(&:to_i).uniq
  end

  # Whether the post will end up with a poll. Deliberately does not go through
  # next_params, which cannot be built before the media have been resolved.
  def poll_present?
    return @options[:poll].present? if @options.key?(:poll)

    stored_params.with_indifferent_access[:poll].present?
  end

  def resolve_media!
    return @media = @scheduled_status.media_attachments.to_a unless @options.key?(:media_ids)

    if media_ids.empty?
      @media = []
      return
    end

    raise Mastodon::ValidationError, I18n.t('media_attachments.validations.too_many') if media_ids.size > Status::MEDIA_ATTACHMENTS_LIMIT || poll_present?

    # Either still unattached, or already owned by this very scheduled status.
    @media = @account.media_attachments
                     .where(status_id: nil)
                     .where(id: media_ids)
                     .where(scheduled_status_id: [nil, @scheduled_status.id])
                     .to_a

    not_found_ids = media_ids - @media.map(&:id)
    raise Mastodon::ValidationError, I18n.t('media_attachments.validations.not_found', ids: not_found_ids.join(', ')) if not_found_ids.any?

    raise Mastodon::ValidationError, I18n.t('media_attachments.validations.images_and_video') if @media.size > 1 && @media.any?(&:audio_or_video?)
    raise Mastodon::ValidationError, I18n.t('media_attachments.validations.not_ready') if @media.any?(&:not_processed?)

    # Preserve the order the client asked for.
    @media = @media.sort_by { |attachment| media_ids.index(attachment.id) }
  end

  # Build a throwaway Status with the new content so the same validations that
  # guard immediate posting also guard the scheduled version.
  def validate_as_status!
    return unless content_change?

    params = next_params

    # `.compact` is not cosmetic: accepts_nested_attributes_for raises
    # "Hash expected for `poll` attributes, got NilClass" rather than treating a
    # nil as "no poll", and the composer sends `poll: null` on every edit of a
    # post that has no poll. PostStatusService#status_attributes compacts for
    # the same reason.
    status = @account.statuses.build({
      text: params[:text].to_s,
      media_attachments: @media,
      ordered_media_attachment_ids: @media.map(&:id),
      thread: thread_for(params[:in_reply_to_id]),
      poll_attributes: poll_attributes_for(params[:poll]),
      sensitive: sensitive_for(params),
      spoiler_text: params[:spoiler_text].to_s,
      visibility: params[:visibility],
      language: params[:language],
    }.compact)

    raise ActiveRecord::RecordInvalid, status unless status.valid?

    # Marking it as destroyed prevents it from being persisted when the media
    # attachments are re-linked below.
    status.destroy
  end

  def thread_for(in_reply_to_id)
    return if in_reply_to_id.blank?

    # A vanished reply target is a real problem, but it is the publisher's job to
    # report it — refusing the edit here would trap the user with a post they
    # cannot fix.
    Status.find_by(id: in_reply_to_id)
  end

  def poll_attributes_for(poll)
    return if poll.blank?

    poll.to_h.symbolize_keys.merge(account: @account, voters_count: 0)
  end

  def sensitive_for(params)
    ActiveModel::Type::Boolean.new.cast(params[:sensitive]) || params[:spoiler_text].present?
  end

  def reattach_media!
    return unless @options.key?(:media_ids)

    kept_ids = @media.map(&:id)

    @scheduled_status.media_attachments.where.not(id: kept_ids).update_all(scheduled_status_id: nil)
    @account.media_attachments.where(id: kept_ids).update_all(scheduled_status_id: @scheduled_status.id)
  end
end
