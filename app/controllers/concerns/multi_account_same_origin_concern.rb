# frozen_string_literal: true

module MultiAccountSameOriginConcern
  extend ActiveSupport::Concern

  private

  def require_same_origin!
    site = request.headers['Sec-Fetch-Site']
    origin = request.origin
    cross_site = site.present? && site != 'same-origin'
    foreign_origin = origin.present? && origin != request.base_url
    unknown_origin = site.blank? && origin.blank?
    return unless cross_site || foreign_origin || unknown_origin

    render json: { error: 'Cross-origin request refused' }, status: 403
  end
end
