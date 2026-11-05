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

  # @_longwhile — 비로그인 접속을 막는 인스턴스라 oEmbed 도 로그인을 요구한다. 상류는 공개·미등재
  # 글을 누구에게나 돌려준다. 웹 화면의 퍼 가기 창은 /api/web/embeds/:id 를 쓴다.
  # `require_authenticated_user!` 를 다시 등록하면 Api::BaseController 의 조건부 등록이
  # 통째로 대체되므로 이름을 따로 둔다.
  def require_oembed_viewer!
    require_authenticated_user!
  end

  def set_status
    @status = status_finder.status
    authorize @status, :show?
  rescue Mastodon::NotPermittedError
    not_found
  end

  # @_longwhile — 익명화(탈퇴) 계정의 글은 퍼 가게 하지 않는다. 임베드 주소(/@옛이름/글/embed)와
  # 글쓴이 표시가 옛 사용자명을 담는다.
  def require_public_status!
    not_found if @status.hidden? || @status.account.anonymized?
  end

  def status_finder
    StatusFinder.new(params[:url])
  end
end
