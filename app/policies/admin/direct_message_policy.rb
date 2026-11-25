# frozen_string_literal: true

class Admin::DirectMessagePolicy < ApplicationPolicy
  def index?
    role.can?(:view_direct_messages)
  end
end
