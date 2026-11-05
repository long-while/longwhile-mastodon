# frozen_string_literal: true

class Api::OEmbedController < Api::BaseController
  include Authorization

  before_action -> { authorize_if_got_token! :read, :'read:statuses' }
  before_action :require_oembed_viewer!
  before_action :set_status
  before_action :require_public_status!

  def show
    render json: @status, serializer: OEmbedSerializer, width: params[:maxwidth], height: params[:maxheight]
  end

  private

  def require_oembed_viewer!
    require_authenticated_user!
  end

  def set_status
    @status = status_finder.status
    authorize @status, :show?
  rescue Mastodon::NotPermittedError
    not_found
  end

  def require_public_status!
    not_found if @status.hidden? || @status.account.anonymized?
  end

  def status_finder
    StatusFinder.new(params[:url])
  end
end
