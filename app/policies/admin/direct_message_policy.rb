# frozen_string_literal: true

class Admin::DirectMessagePolicy < ApplicationPolicy
  def index?
    role.can?(:administrator, :manage_roles)
  end
end
