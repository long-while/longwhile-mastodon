# frozen_string_literal: true

class Api::V1::ScheduledStatusesController < Api::BaseController
  include Authorization

  before_action -> { doorkeeper_authorize! :read, :'read:statuses' }, except: [:update, :destroy]
  before_action -> { doorkeeper_authorize! :write, :'write:statuses' }, only: [:update, :destroy]

  before_action :require_user!
  before_action :set_statuses, only: :index
  before_action :set_status, except: [:index, :usage]

  after_action :insert_pagination_headers, only: :index

  def index
    render json: @statuses, each_serializer: REST::ScheduledStatusSerializer
  end

  def show
    render json: @status, serializer: REST::ScheduledStatusSerializer
  end

  # Lets the web UI show how much of the scheduling allowance is used up
  # without having to page through the whole collection.
  def usage
    scheduled = current_account.scheduled_statuses

    render json: {
      total: scheduled.count,
      total_limit: ScheduledStatus::TOTAL_LIMIT,
      today: scheduled.where('scheduled_at::date = ?::date', Time.now.utc).count,
      daily_limit: ScheduledStatus::DAILY_LIMIT,
      minimum_offset: ScheduledStatus::MINIMUM_OFFSET.to_i,
      failed: scheduled.failed.count,
    }
  end

  def update
    UpdateScheduledStatusService.new.call(@status, scheduled_status_params)
    render json: @status, serializer: REST::ScheduledStatusSerializer
  end

  def destroy
    @status.destroy!
    render_empty
  end

  private

  def set_statuses
    @statuses = current_account.scheduled_statuses.to_a_paginated_by_id(limit_param(DEFAULT_STATUSES_LIMIT), params_slice(:max_id, :since_id, :min_id))
  end

  def set_status
    @status = current_account.scheduled_statuses.find(params[:id])
  end

  # Maps the public request body onto the keys UpdateScheduledStatusService
  # understands. `status` is the public name of the body, which is stored as
  # `text` in the params jsonb.
  #
  # Presence is tested against the raw params rather than the permitted hash on
  # purpose: `permit` drops keys whose value is nil, and Rails' deep_munge turns
  # an empty array into nil. Both of those are exactly how a client says "remove
  # the poll" / "remove all attachments", so relying on the permitted hash would
  # make those two things impossible to express.
  def scheduled_status_params
    permitted = params.permit(
      :scheduled_at,
      :status,
      :spoiler_text,
      :sensitive,
      :visibility,
      :language,
      :in_reply_to_id,
      media_ids: [],
      poll: [:multiple, :hide_totals, :expires_in, { options: [] }]
    )

    options = {}

    options[:scheduled_at]   = permitted[:scheduled_at]   if params.key?(:scheduled_at)
    options[:text]           = permitted[:status].to_s    if params.key?(:status)
    options[:spoiler_text]   = permitted[:spoiler_text].to_s if params.key?(:spoiler_text)
    options[:visibility]     = permitted[:visibility]     if params.key?(:visibility)
    options[:language]       = permitted[:language]       if params.key?(:language)
    options[:in_reply_to_id] = permitted[:in_reply_to_id] if params.key?(:in_reply_to_id)
    options[:sensitive]      = ActiveModel::Type::Boolean.new.cast(permitted[:sensitive]) if params.key?(:sensitive)
    options[:media_ids]      = Array(permitted[:media_ids]) if params.key?(:media_ids)
    options[:poll]           = permitted[:poll]&.to_h if params.key?(:poll)

    options
  end

  def next_path
    api_v1_scheduled_statuses_url pagination_params(max_id: pagination_max_id) if records_continue?
  end

  def prev_path
    api_v1_scheduled_statuses_url pagination_params(min_id: pagination_since_id) unless @statuses.empty?
  end

  def records_continue?
    @statuses.size == limit_param(DEFAULT_STATUSES_LIMIT)
  end

  def pagination_collection
    @statuses
  end
end
