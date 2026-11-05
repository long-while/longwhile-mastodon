# frozen_string_literal: true

class Web::PushNotificationWorker
  include Sidekiq::Worker
  include RoutingHelper

  sidekiq_options queue: 'push', retry: 5

  TTL     = 48.hours
  URGENCY = 'normal'

  # FCM data messages are not end-to-end encrypted: Google sees them in plaintext.
  FCM_REDACTED_DIRECT_BODY  = '새 메시지가 왔습니다'
  FCM_REDACTED_PRIVATE_BODY = '새 글이 있습니다'

  def perform(subscription_id, notification_id)
    @subscription = Web::PushSubscription.find(subscription_id)
    @notification = Notification.find(notification_id)

    return if @notification.updated_at < TTL.ago

    # Clean up old Web::PushSubscriptions that were added before validation of
    # the endpoint and keys: #30542, #30540
    unless @subscription.valid?
      Rails.logger.debug { "Web::PushSubscription is invalid, removing: #{subscription_id}" }
      @subscription.destroy!

      return
    end

    # Polymorphically associated activity could have been deleted
    # in the meantime, so we have to double-check before proceeding
    return unless @notification.activity.present? && @subscription.pushable?(@notification)

    if web_push_request.fcm_native?
      perform_fcm_native_request
    elsif web_push_request.legacy
      perform_legacy_request
    else
      perform_standard_request
    end
  rescue ActiveRecord::RecordNotFound
    true
  end

  private

  def perform_fcm_native_request
    payload = I18n.with_locale(@subscription.locale.presence || I18n.default_locale) do
      fcm_native_payload.to_json
    end
    data = {
      payload: payload,
      account_id: "#{Rails.configuration.x.local_domain}_#{@subscription.user.account_id}",
    }

    Fcm::MessageSender.new.send_data_message(web_push_request.fcm_device_token, data)
  rescue Fcm::MessageSender::UnregisteredError
    @subscription.destroy!
  end

  # Native apps use their own locally-stored session, not the access_token
  # embedded for the web push service worker's benefit - drop it so it isn't
  # sent through Google's servers. The serializer's keys are symbols, so they
  # are stringified first (a string `except` alone silently kept the token).
  def fcm_native_payload
    payload = serialized_notification.as_json.deep_stringify_keys.except('access_token')
    redacted_body = fcm_redacted_body
    redacted_body ? payload.merge('body' => redacted_body) : payload
  end

  # `body` is the only field carrying status text (spoiler_text or text);
  # the title only names the sender.
  def fcm_redacted_body
    status = @notification.target_status
    return if status.nil? || status.distributable?

    status.direct_visibility? ? FCM_REDACTED_DIRECT_BODY : FCM_REDACTED_PRIVATE_BODY
  end

  def perform_legacy_request
    payload = web_push_request.legacy_encrypt(push_notification_json)

    request_pool.with(web_push_request.audience) do |http_client|
      request = Request.new(:post, web_push_request.endpoint, body: payload.fetch(:ciphertext), http_client: http_client)

      request.add_headers(
        'Content-Type' => 'application/octet-stream',
        'Ttl' => TTL.to_s,
        'Urgency' => URGENCY,
        'Content-Encoding' => 'aesgcm',
        'Encryption' => "salt=#{Webpush.encode64(payload.fetch(:salt)).delete('=')}",
        'Crypto-Key' => "dh=#{Webpush.encode64(payload.fetch(:server_public_key)).delete('=')};#{web_push_request.crypto_key_header}",
        'Authorization' => web_push_request.legacy_authorization_header,
        'Unsubscribe-URL' => subscription_url
      )

      send(request)
    end
  end

  def perform_standard_request
    payload = web_push_request.standard_encrypt(push_notification_json)

    request_pool.with(web_push_request.audience) do |http_client|
      request = Request.new(:post, web_push_request.endpoint, body: payload, http_client: http_client)

      request.add_headers(
        'Content-Type' => 'application/octet-stream',
        'Ttl' => TTL.to_s,
        'Urgency' => URGENCY,
        'Content-Encoding' => 'aes128gcm',
        'Authorization' => web_push_request.standard_authorization_header,
        'Unsubscribe-URL' => subscription_url,
        'Content-Length' => payload.length.to_s
      )

      send(request)
    end
  end

  def send(request)
    request.perform do |response|
      # If the server responds with an error in the 4xx range
      # that isn't about rate-limiting or timeouts, we can
      # assume that the subscription is invalid or expired
      # and must be removed

      if (400..499).cover?(response.code) && ![408, 429].include?(response.code)
        @subscription.destroy!
      elsif !(200...300).cover?(response.code)
        raise Mastodon::UnexpectedResponseError, response
      end
    end
  end

  def web_push_request
    @web_push_request ||= WebPushRequest.new(@subscription)
  end

  def push_notification_json
    I18n.with_locale(@subscription.locale.presence || I18n.default_locale) do
      serialized_notification.to_json
    end
  end

  def serialized_notification
    ActiveModelSerializers::SerializableResource.new(
      @notification,
      serializer: Web::NotificationSerializer,
      scope: @subscription,
      scope_name: :current_push_subscription
    )
  end

  def request_pool
    RequestPool.current
  end

  def subscription_url
    api_web_push_subscription_url(id: @subscription.generate_token_for(:unsubscribe))
  end
end
