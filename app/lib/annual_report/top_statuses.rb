# frozen_string_literal: true

class AnnualReport::TopStatuses < AnnualReport::Source
  def generate
    {
      top_statuses: {
        by_reblogs: status_identifier(most_reblogged_status),
        by_favourites: nil,
        by_replies: nil,
      },
    }
  end

  def eligible?
    report_statuses.distributable_visibility.exists?
  end

  private

  def status_identifier(status)
    status.id.to_s if status.present?
  end

  def most_reblogged_status
    base_scope
      .order(reblogs_count: :desc)
      .first
  end

  # 본인에게만 보여주는 결산이라 public_visibility 로 좁힐 이유가 없다. 그대로 두면
  # 모든 툿이 팔로워 전용인 이 인스턴스에서는 결산이 통째로 빈다. DM 만 제외한다.
  def base_scope
    report_statuses.not_direct_visibility.joins(:status_stat)
  end
end
