# frozen_string_literal: true

class OAuth::AuthorizedApplicationsController < Doorkeeper::AuthorizedApplicationsController
  prepend_before_action :store_current_location
  before_action :require_not_suspended!, only: :destroy

  before_action :set_last_used_at_by_app, only: :index, unless: -> { request.format == :json }

  skip_before_action :require_functional!

  layout 'admin'

  include Localized

  # @_longwhile — 목록은 "연결된 앱"(/settings/applications) 한 화면으로 합쳤다.
  # 이 경로는 북마크와 옛 링크를 위해 보내주기만 한다 (settings-phase-4.md §3.1).
  # 권한 취소(DELETE)는 그대로 여기가 받는다.
  def index
    redirect_to settings_applications_path
  end

  def destroy
    Web::PushSubscription.unsubscribe_for(params[:id], current_resource_owner)
    Doorkeeper::Application.find_by(id: params[:id])&.close_streaming_sessions(current_resource_owner)
    super
  end

  private

  def store_current_location
    store_location_for(:user, request.url)
  end

  def require_not_suspended!
    forbidden if current_account.unavailable?
  end

  def set_last_used_at_by_app
    @last_used_at_by_app = current_resource_owner.applications_last_used
  end
end
