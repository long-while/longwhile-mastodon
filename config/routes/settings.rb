# frozen_string_literal: true

namespace :settings do
  resource :profile, only: [:show, :update] do
    resources :pictures, only: :destroy
  end

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
  resources :featured_tags, only: [:index, :create, :destroy]
  resources :login_activities, only: [:index]
end
