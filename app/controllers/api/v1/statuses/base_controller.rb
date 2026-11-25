# frozen_string_literal: true

class Api::V1::Statuses::BaseController < Api::BaseController
  include Authorization

  before_action :set_status
  before_action :log_direct_message_view!

  private

  def set_status
    @status = Status.find(params[:status_id])
    authorize @status, :show?
  rescue ActiveRecord::RecordNotFound, Mastodon::NotPermittedError
    not_found
  end

  def log_direct_message_view!
    return if @status.nil?

    Admin::DirectMessageViewLog.log_status_views!(current_account, [@status])
  end
end
