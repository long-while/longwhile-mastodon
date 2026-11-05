# frozen_string_literal: true

namespace :settings do
  resource :profile, only: [:show, :update] do
    resources :pictures, only: :destroy
  end

  # @_longwhile — "환경설정 → 모양새/알림" 이던 것을 상위 두 화면으로 올렸다.
  #   /settings/preferences/appearance   → /settings/display
  #   /settings/preferences/notifications → /settings/notifications
  # 옛 경로는 북마크와 메일 본문 링크가 살아 있어 보내준다. 메일러의 헬퍼
  # 호출은 새 이름으로 바꿨다 — 리다이렉트에 기대지 않는다.
  # 근거: docs/settings/phases/settings-phase-5.md §1.1
  resource :display, only: [:show, :update], controller: :display
  resource :notifications, only: [:show, :update], controller: :notifications

  get :preferences, to: redirect('/settings/display')
  get 'preferences/appearance', to: redirect('/settings/display')
  get 'preferences/notifications', to: redirect('/settings/notifications')

  resource :export, only: [:show, :create]

  namespace :exports, constraints: { format: :csv } do
    resources :follows, only: :index, controller: :following_accounts
    resources :blocks, only: :index, controller: :blocked_accounts
    resources :mutes, only: :index, controller: :muted_accounts
    resources :lists, only: :index
    resources :bookmarks, only: :index
    resources :custom_filters, only: :index, constraints: { format: :json }, controller: :custom_filters
  end

  resources :two_factor_authentication_methods, only: [:index] do
    collection do
      post :disable
    end
  end

  scope module: :two_factor_authentication do
    resource :otp_authentication, only: [:show, :create], controller: :otp_authentication

    resources :webauthn_credentials, only: [:index, :new, :create, :destroy], path: 'security_keys' do
      collection do
        get :options
      end
    end
  end

  namespace :two_factor_authentication do
    resources :recovery_codes, only: [:create]
    resource :confirmation, only: [:new, :create]
  end

  resources :applications, except: [:edit] do
    member do
      post :regenerate
    end
  end

  resource :delete, only: [:show, :destroy]

  resources :sessions, only: [:destroy]
  resources :login_activities, only: [:index]
end
