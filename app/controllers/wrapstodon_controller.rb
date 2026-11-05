# frozen_string_literal: true

class WrapstodonController < ApplicationController
  include WebAppControllerConcern
  include Authorization
  include AccountOwnedConcern

  vary_by 'Accept, Accept-Language, Cookie'

  # @_longwhile — 고정된 프런트에는 wrapstodon 엔트리가 없어 이 화면을 그리면 500 이다.
  # 기능을 켜지 않았으면(포크 기본값, config/settings.yml) 없는 화면으로 둔다.
  before_action :not_found, unless: -> { Setting.wrapstodon }
  before_action :set_generated_annual_report

  skip_before_action :require_functional!, only: :show, unless: :limited_federation_mode?

  def show
    expires_in 10.minutes, public: true if current_account.nil?
  end

  private

  def set_generated_annual_report
    @generated_annual_report = GeneratedAnnualReport.find_by!(account: @account, year: params[:year], share_key: params[:share_key])
  end
end
