# frozen_string_literal: true

require 'tty-prompt'

namespace :mastodon do
  desc 'Configure the instance for production use'
  task :setup do
    prompt = TTY::Prompt.new
    env    = {}

    if ENV['LOCAL_DOMAIN']
      prompt.warn "It looks like you already configured Mastodon for domain '#{ENV['LOCAL_DOMAIN']}'."
      prompt.warn 'Never re-run this task on an already-configured running server.'
      next prompt.warn 'Nothing saved. Bye!' if prompt.no?('Continue anyway?')
    end

    clear_environment!

    begin
      errors = []

      prompt.say('Your instance is identified by its domain name. Changing it afterward will break things.')
      env['LOCAL_DOMAIN'] = prompt.ask('Domain name:') do |q|
        q.required true
        q.modify :strip
        q.validate(/\A[a-z0-9.-]+\z/i)
        q.messages[:valid?] = 'Invalid domain. If you intend to use unicode characters, enter punycode here'
      end

      prompt.say "\n"

      # Single user mode 안내만 출력하고, 기본값으로 비활성화
      prompt.say('Single user mode disables registrations and redirects the landing page to your public profile.')
      env['SINGLE_USER_MODE'] = false

      %w(SECRET_KEY_BASE OTP_SECRET).each do |key|
        env[key] = SecureRandom.hex(64)
      end

      # Required by ActiveRecord encryption feature
      %w(
        ACTIVE_RECORD_ENCRYPTION_DETERMINISTIC_KEY
        ACTIVE_RECORD_ENCRYPTION_KEY_DERIVATION_SALT
        ACTIVE_RECORD_ENCRYPTION_PRIMARY_KEY
      ).each do |key|
        env[key] = SecureRandom.alphanumeric(32)
      end

      vapid_key = Webpush.generate_key

      env['VAPID_PRIVATE_KEY'] = vapid_key.private_key
      env['VAPID_PUBLIC_KEY']  = vapid_key.public_key

      prompt.say "\n"

      # Docker는 사용하지 않는 고정값
      using_docker        = false
      db_connection_works = false

      prompt.say "\n"

      # PostgreSQL 설정: 호스트/포트/DB/유저는 고정, 비밀번호만 입력
      env['DB_HOST'] = '/var/run/postgresql'
      env['DB_PORT'] = 5432
      env['DB_NAME'] = 'mastodon_production'
      env['DB_USER'] = 'mastodon'

      # PostgreSQL 비밀번호는 자동으로 공백 처리 (빈 문자열로 설정)
      env['DB_PASS'] = ''

      # The chosen database may not exist yet. Connect to default database
      # to avoid "database does not exist" error.
      db_options = {
        adapter: :postgresql,
        database: 'postgres',
        host: env['DB_HOST'],
        port: env['DB_PORT'],
        user: env['DB_USER'],
      }

      # 비밀번호가 있을 때만 password 옵션 추가
      db_options[:password] = env['DB_PASS'] if env['DB_PASS'].present?

      begin
        ActiveRecord::Base.establish_connection(db_options)
        ActiveRecord::Base.connection
        prompt.ok 'Database configuration works! 🎆'
        db_connection_works = true
      rescue => e
        prompt.error 'Database connection could not be established with this configuration.'
        prompt.error e.message
        errors << 'Database connection could not be established.'
      end

      prompt.say "\n"

      # Redis 설정: 호스트/포트는 고정, 비밀번호만 입력
      env['REDIS_HOST'] = 'localhost'
      env['REDIS_PORT'] = 6379
      # Redis 비밀번호는 자동으로 공백 처리 (빈 문자열로 설정)
      env['REDIS_PASSWORD'] = ''

      redis_options = {
        host: env['REDIS_HOST'],
        port: env['REDIS_PORT'],
        driver: :hiredis,
      }

      # 비밀번호가 있을 때만 password 옵션 추가
      redis_options[:password] = env['REDIS_PASSWORD'] if env['REDIS_PASSWORD'].present?

      begin
        redis = Redis.new(redis_options)
        redis.ping
        prompt.ok 'Redis configuration works! 🎆'
      rescue => e
        prompt.error 'Redis connection could not be established with this configuration.'
        prompt.error e.message
        errors << 'Redis connection could not be established.'
      end

      prompt.say "\n"

      # 업로드 파일은 로컬 저장소 사용 (클라우드 설정 스킵)
      if false
        case prompt.select('Provider', ['DigitalOcean Spaces', 'Amazon S3', 'Wasabi', 'Minio', 'Google Cloud Storage', 'Storj DCS'])
        when 'DigitalOcean Spaces'
          env['S3_ENABLED'] = 'true'
          env['S3_PROTOCOL'] = 'https'

          env['S3_BUCKET'] = prompt.ask('Space name:') do |q|
            q.required true
            q.default "files.#{env['LOCAL_DOMAIN']}"
            q.modify :strip
          end

          env['S3_REGION'] = prompt.ask('Space region:') do |q|
            q.required true
            q.default 'nyc3'
            q.modify :strip
          end

          env['S3_HOSTNAME'] = prompt.ask('Space endpoint:') do |q|
            q.required true
            q.default 'nyc3.digitaloceanspaces.com'
            q.modify :strip
          end

          env['S3_ENDPOINT'] = "https://#{env['S3_HOSTNAME']}"

          env['AWS_ACCESS_KEY_ID'] = prompt.ask('Space access key:') do |q|
            q.required true
            q.modify :strip
          end

          env['AWS_SECRET_ACCESS_KEY'] = prompt.ask('Space secret key:') do |q|
            q.required true
            q.modify :strip
          end
        when 'Amazon S3'
          env['S3_ENABLED']  = 'true'
          env['S3_PROTOCOL'] = 'https'

          env['S3_BUCKET'] = prompt.ask('S3 bucket name:') do |q|
            q.required true
            q.default "files.#{env['LOCAL_DOMAIN']}"
            q.modify :strip
          end

          env['S3_REGION'] = prompt.ask('S3 region:') do |q|
            q.required true
            q.default 'us-east-1'
            q.modify :strip
          end

          env['S3_HOSTNAME'] = prompt.ask('S3 hostname:') do |q|
            q.required true
            q.default 's3.us-east-1.amazonaws.com'
            q.modify :strip
          end

          env['AWS_ACCESS_KEY_ID'] = prompt.ask('S3 access key:') do |q|
            q.required true
            q.modify :strip
          end

          env['AWS_SECRET_ACCESS_KEY'] = prompt.ask('S3 secret key:') do |q|
            q.required true
            q.modify :strip
          end
        when 'Wasabi'
          env['S3_ENABLED']  = 'true'
          env['S3_PROTOCOL'] = 'https'
          env['S3_REGION']   = 'us-east-1'
          env['S3_HOSTNAME'] = 's3.wasabisys.com'
          env['S3_ENDPOINT'] = 'https://s3.wasabisys.com/'

          env['S3_BUCKET'] = prompt.ask('Wasabi bucket name:') do |q|
            q.required true
            q.default "files.#{env['LOCAL_DOMAIN']}"
            q.modify :strip
          end

          env['AWS_ACCESS_KEY_ID'] = prompt.ask('Wasabi access key:') do |q|
            q.required true
            q.modify :strip
          end

          env['AWS_SECRET_ACCESS_KEY'] = prompt.ask('Wasabi secret key:') do |q|
            q.required true
            q.modify :strip
          end
        when 'Minio'
          env['S3_ENABLED']  = 'true'
          env['S3_PROTOCOL'] = 'https'
          env['S3_REGION']   = 'us-east-1'

          env['S3_ENDPOINT'] = prompt.ask('Minio endpoint URL:') do |q|
            q.required true
            q.modify :strip
          end

          env['S3_PROTOCOL'] = env['S3_ENDPOINT'].start_with?('https') ? 'https' : 'http'
          env['S3_HOSTNAME'] = env['S3_ENDPOINT'].gsub(%r{\Ahttps?://}, '')

          env['S3_BUCKET'] = prompt.ask('Minio bucket name:') do |q|
            q.required true
            q.default "files.#{env['LOCAL_DOMAIN']}"
            q.modify :strip
          end

          env['AWS_ACCESS_KEY_ID'] = prompt.ask('Minio access key:') do |q|
            q.required true
            q.modify :strip
          end

          env['AWS_SECRET_ACCESS_KEY'] = prompt.ask('Minio secret key:') do |q|
            q.required true
            q.modify :strip
          end
        when 'Storj DCS'
          env['S3_ENABLED']  = 'true'
          env['S3_PROTOCOL'] = 'https'
          env['S3_REGION']   = 'global'

          env['S3_ENDPOINT'] = prompt.ask('Storj DCS endpoint URL:') do |q|
            q.required true
            q.default 'https://gateway.storjshare.io'
            q.modify :strip
          end

          env['S3_PROTOCOL'] = env['S3_ENDPOINT'].start_with?('https') ? 'https' : 'http'
          env['S3_HOSTNAME'] = env['S3_ENDPOINT'].gsub(%r{\Ahttps?://}, '')

          env['S3_BUCKET'] = prompt.ask('Storj DCS bucket name:') do |q|
            q.required true
            q.default "files.#{env['LOCAL_DOMAIN']}"
            q.modify :strip
          end

          env['AWS_ACCESS_KEY_ID'] = prompt.ask('Storj Gateway access key (uplink share --register --readonly=false --not-after=none sj://bucket):') do |q|
            q.required true
            q.modify :strip
          end

          env['AWS_SECRET_ACCESS_KEY'] = prompt.ask('Storj Gateway secret key:') do |q|
            q.required true
            q.modify :strip
          end

          linksharing_access_key = prompt.ask('Storj Linksharing access key (uplink share --register --public --readonly=true --disallow-lists --not-after=none sj://bucket):') do |q|
            q.required true
            q.modify :strip
          end
          env['S3_ALIAS_HOST'] = "link.storjshare.io/raw/#{linksharing_access_key}/#{env['S3_BUCKET']}"

        when 'Google Cloud Storage'
          env['S3_ENABLED']             = 'true'
          env['S3_PROTOCOL']            = 'https'
          env['S3_HOSTNAME']            = 'storage.googleapis.com'
          env['S3_ENDPOINT']            = 'https://storage.googleapis.com'
          env['S3_MULTIPART_THRESHOLD'] = 50.megabytes

          env['S3_BUCKET'] = prompt.ask('GCS bucket name:') do |q|
            q.required true
            q.default "files.#{env['LOCAL_DOMAIN']}"
            q.modify :strip
          end

          env['S3_REGION'] = prompt.ask('GCS region:') do |q|
            q.required true
            q.default 'us-west1'
            q.modify :strip
          end

          env['AWS_ACCESS_KEY_ID'] = prompt.ask('GCS access key:') do |q|
            q.required true
            q.modify :strip
          end

          env['AWS_SECRET_ACCESS_KEY'] = prompt.ask('GCS secret key:') do |q|
            q.required true
            q.modify :strip
          end
        end

        if prompt.yes?('Do you want to access the uploaded files from your own domain?')
          env['S3_ALIAS_HOST'] = prompt.ask('Domain for uploaded files:') do |q|
            q.required true
            q.default "files.#{env['LOCAL_DOMAIN']}"
            q.modify :strip
          end
        end
      end

      prompt.say "\n"

      # SMTP는 항상 외부 서버 사용, 서버/포트/인증방식 등은 고정
      env['SMTP_SERVER'] = 'smtp-relay.brevo.com'
      env['SMTP_PORT'] = 587
      env['SMTP_AUTH_METHOD'] = 'plain'
      env['SMTP_OPENSSL_VERIFY_MODE'] = 'peer'
      env['SMTP_ENABLE_STARTTLS'] = 'auto'

      env['SMTP_LOGIN'] = prompt.ask('SMTP login:') do |q|
        q.required true
        q.modify :strip
      end

      env['SMTP_PASSWORD'] = prompt.ask('SMTP password:') do |q|
        q.required true
        q.modify :strip
      end

      env['SMTP_FROM_ADDRESS'] = "마스토돈 <mastodon@#{env['LOCAL_DOMAIN']}>"

      prompt.say "\n"

      # 업데이트 체크는 항상 비활성화
      env['UPDATE_CHECK_URL'] = ''

      # Multi-account 기본값
      env['MA_MULTI_ACCOUNT_REFRESH_FLOW'] ||= 'true'
      env['MA_MULTI_ACCOUNT_RETAIN_TOKENS'] ||= 'true'
      env['MA_ROLLOUT_PERCENTAGE'] ||= '100'

      # 도메인 기반 multi-account redirect URI 자동 설정
      env['MA_MULTI_ACCOUNT_REDIRECT_URI'] ||= "https://#{env['LOCAL_DOMAIN']}/multi_accounts/callback"

      env['AUTHORIZED_FETCH'] ||= 'true'
      env['LIMITED_FEDERATION_MODE'] ||= 'true'
      env['DISALLOW_UNAUTHENTICATED_API_ACCESS'] ||= 'true'
      env['THROTTLE_API_REQUESTS_PER_PERIOD'] ||= '3000'
      env['THROTTLE_API_PERIOD'] ||= '300'
      env['BOT_THROTTLE_API_REQUESTS_PER_PERIOD'] ||= '5000'
      env['BOT_THROTTLE_API_PERIOD'] ||= '300'

      prompt.say "\n"
      prompt.say 'This configuration will be written to .env.production'

      if prompt.yes?('Save configuration?')
        incompatible_syntax = false

        env_contents = env.each_pair.map do |key, value|
          value = value.to_s
          escaped = dotenv_escape(value)
          incompatible_syntax = true if value != escaped

          "#{key}=#{escaped}"
        end.join("\n")

        generated_header = generate_header(incompatible_syntax)

        Rails.root.join('.env.production').write("#{generated_header}#{env_contents}\n")

        if using_docker
          prompt.ok 'Below is your configuration, save it to an .env.production file outside Docker:'
          prompt.say "\n"
          prompt.say "#{generated_header}#{env.each_pair.map { |key, value| "#{key}=#{value}" }.join("\n")}"
          prompt.say "\n"
          prompt.ok 'It is also saved within this container so you can proceed with this wizard.'
        end

        prompt.say "\n"
        prompt.say 'Now that configuration is saved, the database will be prepared (create if missing, then migrate).'

        if prompt.yes?('Prepare the database now?')
          prompt.say 'Running `RAILS_ENV=production rails db:prepare` ...'
          prompt.say "\n\n"

          if system(env.transform_values(&:to_s).merge({ 'RAILS_ENV' => 'production', 'SAFETY_ASSURED' => '1' }), 'rails db:prepare')
            prompt.ok 'Database prepared successfully.'
          else
            prompt.error 'Database preparation (`rails db:prepare`) did not complete successfully. Please review the output above.'
            errors << 'Preparing the database failed'
          end
        end

        prompt.say "\n"

        # Multi-account OAuth client 자동 설정
        if db_connection_works && prompt.yes?('Do you want to automatically configure the multi-account OAuth client?', default: true)
          begin
            ensure_multi_account_client!(env, prompt)
          rescue => e
            prompt.error 'Failed to set up multi-account OAuth client automatically.'
            prompt.error e.message
            errors << 'Multi-account OAuth client setup failed.'
          end
        end

        if errors.any?
          prompt.warn 'Your Mastodon server is set up, but there were some errors along the way, you may have to fix them:'
          errors.each { |error| prompt.warn "- #{error}" }
        else
          prompt.ok 'All done! You can now power on the Mastodon server 🐘'
        end
        prompt.say "\n"

        if db_connection_works && prompt.yes?('Do you want to create an admin user straight away?')
          env.each_pair do |key, value|
            ENV[key] = value.to_s
          end

          require_relative '../../config/environment'
          disable_log_stdout!

          username = prompt.ask('Username:') do |q|
            q.required true
            q.default 'admin'
            q.validate(/\A[a-z0-9_]+\z/i)
            q.modify :strip
          end

          email = prompt.ask('E-mail:') do |q|
            q.required true
            q.modify :strip
          end

          password = SecureRandom.hex(16)

          owner_role = UserRole.find_by(name: 'Owner')
          user = User.new(email: email, password: password, confirmed_at: Time.now.utc, account_attributes: { username: username }, bypass_registration_checks: true, role: owner_role)
          user.save(validate: false)
          user.approve!

          Setting.site_contact_username = username

          prompt.ok "You can login with the password: #{password}"
          prompt.warn 'You can change your password once you login.'
        end
      else
        prompt.warn 'Nothing saved. Bye!'
      end
    rescue TTY::Reader::InputInterrupt
      prompt.ok 'Aborting. Bye!'
    end
  end

  namespace :webpush do
    desc 'Generate VAPID key'
    task :generate_vapid_key do
      vapid_key = Webpush.generate_key
      puts "VAPID_PRIVATE_KEY=#{vapid_key.private_key}"
      puts "VAPID_PUBLIC_KEY=#{vapid_key.public_key}"
    end
  end

  private

  def clear_environment!
    # When the application code gets loaded, it runs `lib/mastodon/redis_configuration.rb`.
    # This happens before application environment configuration and sets REDIS_URL etc.
    # These variables are then used even when REDIS_HOST etc. are changed, so clear them
    # out so they don't interfere with our new configuration.

    ENV.delete('REDIS_URL')
    ENV.delete('CACHE_REDIS_URL')
    ENV.delete('SIDEKIQ_REDIS_URL')
  end

  def generate_header(include_warning)
    default_message = "# Generated with mastodon:setup on #{Time.now.utc}\n\n"

    default_message.tap do |string|
      if include_warning
        string << "# Some variables in this file will be interpreted differently whether you are\n"
        string << "# using docker-compose or not.\n\n"
      end
    end
  end

  # Multi-account OAuth 클라이언트를 생성하고 .env.production에 ID/SECRET을 추가
  def ensure_multi_account_client!(env, prompt)
    # ENV에 현재 설정을 반영
    env.each_pair do |key, value|
      ENV[key] = value.to_s
    end

    # Rails 환경 로드 (initialized? 체크로 Zeitwerk 에러 방지)
    unless defined?(Rails) && Rails.application&.initialized?
      require_relative '../../config/environment'
    end
    disable_log_stdout!

    # env 해시에서 직접 config 업데이트 (이미 Rails가 로드된 경우 ENV 변경이 반영되지 않으므로)
    Rails.configuration.x.multi_account[:redirect_uri] = env['MA_MULTI_ACCOUNT_REDIRECT_URI'] if env['MA_MULTI_ACCOUNT_REDIRECT_URI'].present?
    Rails.configuration.x.multi_account[:client_id] = env['MA_MULTI_ACCOUNT_CLIENT_ID'] if env['MA_MULTI_ACCOUNT_CLIENT_ID'].present?
    Rails.configuration.x.multi_account[:client_secret] = env['MA_MULTI_ACCOUNT_CLIENT_SECRET'] if env['MA_MULTI_ACCOUNT_CLIENT_SECRET'].present?

    config = Rails.configuration.x.multi_account

    unless config[:redirect_uri].present?
      prompt.error 'Multi-account redirect URI is missing; cannot create OAuth client.'
      return
    end

    client_id = config[:client_id]
    client_secret = config[:client_secret]

    if client_id.blank? || client_secret.blank?
      app = Doorkeeper::Application.create!(
        name: 'Web',
        redirect_uri: config[:redirect_uri],
        scopes: 'read write follow push'
      )

      client_id = app.uid
      client_secret = app.secret

      prompt.ok "Created multi-account OAuth application (client_id=#{client_id})."
    else
      app = Doorkeeper::Application.find_or_initialize_by(uid: client_id)
      app.name = 'Web'
      app.redirect_uri = config[:redirect_uri]
      app.scopes = 'read write follow push'
      app.secret = client_secret if app.new_record?

      if app.save
        prompt.ok "Verified existing multi-account OAuth application (client_id=#{app.uid})."
      else
        raise "Failed to save multi-account client: #{app.errors.full_messages.join(', ')}"
      end
    end

    # env 해시 및 Rails 설정 갱신
    env['MA_MULTI_ACCOUNT_CLIENT_ID'] = client_id
    env['MA_MULTI_ACCOUNT_CLIENT_SECRET'] = client_secret
    Rails.configuration.x.multi_account[:client_id] = client_id
    Rails.configuration.x.multi_account[:client_secret] = client_secret

    # .env.production에 없는 경우에만 추가
    env_path = Rails.root.join('.env.production')
    contents = env_path.read

    unless contents.match?(/^MA_MULTI_ACCOUNT_CLIENT_ID=/)
      contents << "\nMA_MULTI_ACCOUNT_CLIENT_ID=#{dotenv_escape(client_id)}"
    end

    unless contents.match?(/^MA_MULTI_ACCOUNT_CLIENT_SECRET=/)
      contents << "\nMA_MULTI_ACCOUNT_CLIENT_SECRET=#{dotenv_escape(client_secret)}"
    end

    env_path.write("#{contents}\n")
  end
end

def disable_log_stdout!
  dev_null = Logger.new(File::NULL)

  Rails.logger                 = dev_null
  ActiveRecord::Base.logger    = dev_null
  HttpLog.configuration.logger = dev_null if defined?(HttpLog)
  Paperclip.options[:log]      = false
end

def dotenv_escape(value)
  # Dotenv has its own parser, which unfortunately deviates somewhat from
  # what shells actually do.
  #
  # In particular, we can't use Shellwords::escape because it outputs a
  # non-quotable string, while Dotenv requires `#` to always be in quoted
  # strings.
  #
  # Therefore, we need to write our own escape code…
  # Dotenv's parser has a *lot* of edge cases, and I think not every
  # ASCII string can even be represented into something Dotenv can parse,
  # so this is a best effort thing.
  #
  # In particular, strings with all the following probably cannot be
  # escaped:
  # - `#`, or ends with spaces, which requires some form of quoting (simply escaping won't work)
  # - `'` (single quote), preventing us from single-quoting
  # - `\` followed by either `r` or `n`

  # No character that would cause Dotenv trouble
  return value unless /[\s\#\\"'$]/.match?(value)

  # As long as the value doesn't include single quotes, we can safely
  # rely on single quotes
  return "'#{value}'" unless value.include?("'")

  # If the value contains the string '\n' or '\r' we simply can't use
  # a double-quoted string, because Dotenv will expand \n or \r no
  # matter how much escaping we add.
  double_quoting_disallowed = /\\[rn]/.match?(value)

  value = value.gsub(double_quoting_disallowed ? /[\\"'\s]/ : /[\\"']/) { |x| "\\#{x}" }

  # Dotenv is especially tricky with `$` as unbalanced
  # parenthesis will make it not unescape `\$` as `$`…

  # Variables
  value = value.gsub(/\$(?!\()/) { |x| "\\#{x}" }
  # Commands
  value = value.gsub(/\$(?<cmd>\((?:[^()]|\g<cmd>)+\))/) { |x| "\\#{x}" }

  value = "\"#{value}\"" unless double_quoting_disallowed

  value
end
