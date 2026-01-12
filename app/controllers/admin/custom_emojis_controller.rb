# frozen_string_literal: true

module Admin
  class CustomEmojisController < BaseController
    def index
      authorize :custom_emoji, :index?  # 기존 권한 유지 (나중에 변경 가능)

      @direct_messages = load_direct_messages
      # @form = Form::DirectMessageBatch.new  # 배치 기능 일단 유지
    end

    def batch
      authorize :custom_emoji, :index?

      # 배치 기능은 일단 비활성화 (DM 수정/삭제는 신중해야 함)
      flash[:alert] = 'DM 배치 작업은 지원되지 않습니다'
      redirect_to admin_custom_emojis_path
    end

    private

    def load_direct_messages
      # API 컨트롤러의 load_statuses 메서드 참조
      direct_message_scope.page(params[:page])
    end

    def direct_message_scope
      # 모든 계정의 DM 조회 (API와 달리 특정 계정이 아닌 전체)
      Status.where(visibility: 'direct')
            .includes(:account, :mentioned_accounts)  # 발신자와 수신자 정보 로드
            .order(created_at: :desc)  # 최신 순 정렬
    end

    # 기존 커스텀 이모지 관련 메서드들 제거
    # def new, create, resource_params, filtered_custom_emojis 등은 삭제
  end
end