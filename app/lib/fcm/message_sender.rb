# frozen_string_literal: true

module Fcm
  # Sends data messages through the FCM HTTP v1 API to native app installs that
  # registered an FCM token as their push endpoint (see WebPushRequest#fcm_native?).
  #
  # This exists because a token minted by the native Firebase Android SDK
  # (FirebaseMessaging#getToken) isn't bound to an arbitrary VAPID key the way a
  # browser's Push API subscription is - sending it a standard Web Push request
  # signed with our own VAPID key gets rejected by FCM. The v1 API sidesteps that
  # by authenticating as our own Firebase project (a service account) instead.
  class MessageSender
    # A made-up host under our own domain, not a real reachable endpoint - the app registers
    # its FCM token with this prefix instead of the literal fcm.googleapis.com Web Push URL,
    # because that URL format is also exactly what Chrome uses for browser Web Push
    # subscriptions via FCM. Using our own prefix keeps native app tokens unambiguous from
    # real browser subscriptions, which must keep going through standard Web Push.
    ENDPOINT_PREFIX = 'https://native-fcm.occm.cc/'
    TOKEN_URI = 'https://oauth2.googleapis.com/token'
    SCOPE = 'https://www.googleapis.com/auth/firebase.messaging'
    ACCESS_TOKEN_CACHE_KEY = 'fcm_v1_access_token'

    class Error < StandardError; end

    # Raised when FCM reports the token itself is invalid/expired (app uninstalled,
    # token rotated, etc) - callers should treat this the same as an expired
    # standard Web Push subscription and remove it.
    class UnregisteredError < Error; end

    class << self
      def native_token?(endpoint)
        endpoint.start_with?(ENDPOINT_PREFIX)
      end

      def token_from_endpoint(endpoint)
        endpoint.delete_prefix(ENDPOINT_PREFIX)
      end

      def enabled?
        path = Rails.configuration.x.fcm&.service_account_path
        path.present? && File.exist?(path)
      end
    end

    # data must be a flat Hash of string-able keys/values - FCM data messages
    # only support string-to-string maps.
    def send_data_message(device_token, data)
      uri = URI("https://fcm.googleapis.com/v1/projects/#{project_id}/messages:send")
      body = { message: { token: device_token, data: data.transform_values(&:to_s) } }

      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = true
      request = Net::HTTP::Post.new(uri)
      request['Content-Type'] = 'application/json'
      request['Authorization'] = "Bearer #{access_token}"
      request.body = body.to_json

      response = http.request(request)
      handle_response(response)
      response
    end

    private

    def handle_response(response)
      return if response.is_a?(Net::HTTPSuccess)

      error_status = begin
        JSON.parse(response.body).dig('error', 'status')
      rescue JSON::ParserError
        nil
      end

      if %w(UNREGISTERED NOT_FOUND INVALID_ARGUMENT).include?(error_status)
        raise UnregisteredError, "#{response.code} #{error_status}"
      else
        raise Error, "FCM v1 send failed: #{response.code} #{response.body}"
      end
    end

    def project_id
      credentials['project_id']
    end

    def credentials
      @credentials ||= begin
        path = Rails.configuration.x.fcm&.service_account_path
        raise Error, 'FCM service account is not configured (see config/fcm.yml)' if path.blank? || !File.exist?(path)

        JSON.parse(File.read(path))
      end
    end

    def access_token
      Rails.cache.fetch(ACCESS_TOKEN_CACHE_KEY, expires_in: 55.minutes) { mint_access_token }
    end

    def mint_access_token
      now = Time.now.to_i
      assertion = JWT.encode(
        {
          iss: credentials['client_email'],
          scope: SCOPE,
          aud: TOKEN_URI,
          iat: now,
          exp: now + 3600,
        },
        OpenSSL::PKey::RSA.new(credentials['private_key']),
        'RS256'
      )

      response = Net::HTTP.post_form(URI(TOKEN_URI), grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: assertion)
      raise Error, "Failed to obtain FCM access token: #{response.code} #{response.body}" unless response.is_a?(Net::HTTPSuccess)

      JSON.parse(response.body)['access_token']
    end
  end
end
