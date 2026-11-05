# frozen_string_literal: true

# @_longwhile — "알림을 줄이고 싶다" 를 한 화면에서 끝내게 만든다.
#
# 전에는 셋으로 쪼개져 있었다 — 메일 알림(여기), 웹앱 알림 탭의 알림 정책,
# 알림 컬럼 톱니바퀴. 앞의 둘은 서버에 저장되므로 합칠 수 있다. 컬럼 톱니바퀴는
# 브라우저에 저장돼 Rails 화면에서 읽고 쓸 수 없어 웹앱에 남긴다 (화면 아래
# 안내 한 줄로 잇는다).
#
# 다섯 정책 중 셋만 노출한다. for_private_mentions 는 모든 글이 팔로워
# 전용이라 범주가 성립하지 않고, for_limited_accounts 는 연합하지 않아
# 대상이 없다. 근거: DECISIONS A-46, settings-phase-6.md §3.2
class Settings::NotificationsController < Settings::PreferencesBaseController
  # 이 서버에서 의미가 있는 것만. 나머지 둘은 컬럼째 그대로 두고 건드리지 않는다.
  POLICY_FIELDS = %i(for_not_following for_not_followers for_new_accounts).freeze
  POLICY_VALUES = %w(accept filter drop).freeze

  before_action :set_policy

  def update
    # 반만 저장되는 것이 최악이다 — 둘을 한 트랜잭션으로 묶는다.
    ApplicationRecord.transaction do
      @policy.update!(policy_params)
      current_user.update!(user_params)
    end

    I18n.locale = current_user.locale
    redirect_to after_update_redirect_path, notice: I18n.t('generic.changes_saved_msg')
  rescue ActiveRecord::RecordInvalid
    render :show
  end

  private

  def set_policy
    @policy = NotificationPolicy.find_or_initialize_by(account: current_account)
  end

  # 개인 메일 알림을 걷어낸 뒤로, 관리자가 아닌 사람에게는 이 폼에 user[...]
  # 필드가 하나도 없다. 그대로 두면 params.expect 가 ParameterMissing 으로
  # 터진다 — 저장 버튼을 누르는 순간 400 이다.
  def user_params
    return {} if params[:user].blank?

    super
  end

  # enum 은 목록 밖의 값을 받으면 ArgumentError 로 터진다 — 검증 오류가 아니라
  # 500 이다. permit 만으로는 못 막으므로 값까지 거른다.
  def policy_params
    return {} if params[:notification_policy].blank?

    params
      .require(:notification_policy)
      .permit(*POLICY_FIELDS)
      .select { |_, value| POLICY_VALUES.include?(value) }
  end

  def after_update_redirect_path
    settings_notifications_path
  end
end
