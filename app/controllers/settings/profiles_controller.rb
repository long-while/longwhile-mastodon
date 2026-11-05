# frozen_string_literal: true

class Settings::ProfilesController < Settings::BaseController
  before_action :set_account

  def show
    @account.build_fields
  end

  def update
    toggle_changed = private_account_toggle_changed?

    if UpdateAccountService.new.call(@account, account_attributes(toggle_changed))
      # @_longwhile — 개인정보 화면을 프로필로 합치면서 사용자 설정(읽음 표시)도
      # 이 폼이 저장한다. 저장 버튼이 한 화면에 하나여야 한다 (settings-phase-4.md §1.4).
      current_user.update!(settings_attributes: account_params[:settings]) if account_params[:settings].present?
      ActivityPub::UpdateDistributionWorker.perform_in(ActivityPub::UpdateDistributionWorker::DEBOUNCE_DELAY, @account.id)
      redirect_to settings_profile_path, notice: I18n.t('generic.changes_saved_msg')
    else
      @account.build_fields
      render :show
    end
  end

  private

  # private_account 도 여기서 받는다. 빼 두면 토글만 보낸 요청이 expect 에서 400 이 되고,
  # 아래 판정이 params 를 직접 읽다가 account 가 문자열이면 500 이 난다.
  def account_params
    params.expect(account: [:display_name, :note, :avatar, :header, :private_account, fields_attributes: [[:name, :value]], settings: UserSettings.keys])
  end

  # ─── @_longwhile custom feature / 한참(longwhile) 제작 기능 — 프로텍트(잠금) 계정 프로필 설정 ───
  # 사용·재사용 시 서버 내 출처 표기 필수 / Credit required to use or reuse:
  #   Twitter/X @_longwhile · Crepe https://kre.pe/QTRx
  # 이 토글은 팔로우 승인 여부만 정한다. 공개 범위는 건드리지 않는다 —
  # 모든 툿이 이미 팔로워 전용이라 잠금과 무관하다.
  def account_attributes(toggle_changed)
    attributes = account_params.except(:settings, :private_account)
    return attributes unless toggle_changed

    attributes.merge(locked: private_account_enabled?, hide_collections: private_account_enabled?)
  end

  def private_account_toggle_changed?
    return false if account_params[:private_account].blank?

    @account.locked? != private_account_enabled?
  end

  def private_account_enabled?
    ActiveModel::Type::Boolean.new.cast(account_params[:private_account])
  end

  def set_account
    @account = current_account
  end
end
