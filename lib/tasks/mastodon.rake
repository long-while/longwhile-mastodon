# frozen_string_literal: true

require 'tty-prompt'

namespace :mastodon do
  # 이 인스턴스용으로 만든 기능 중, 코드 기본값으로 대신할 수 없는 설정.
  # DM 채팅이 그렇다 — lib/mastodon/dm_chat.rb 가 물을 때마다 ENV 를 읽고
  # 'true' 가 아니면 전부 꺼짐으로 보므로, 값을 안 넣은 것과 꺼 둔 것이
  # 구분되지 않는다.
  #
  # 나머지(DM_RATE_LIMIT, STATUS_IDS_LIMIT, SCHEDULED_STATUS_* , COUNT_DIRECT_STATUSES)
  # 는 이미 .env.production.sample 에 적힌 값이 코드 기본값이라, 다르게 쓰고
  # 싶을 때만 적으면 된다.
  LONGWHILE_DEFAULTS = {
    'DM_CHAT_ENABLED' => 'true',
  }.freeze

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

      begin
        # This strips subdomains, only keeping one label + a public suffix
        domain = Addressable::URI.new(host: env['LOCAL_DOMAIN']).domain
        if domain.include?('masto') || domain.include?('mstdn')
          prompt.warn 'The Mastodon name is a trademark and its use is restricted.'
          prompt.warn 'You can read the trademark policy at https://joinmastodon.org/trademark'
          next prompt.warn 'Nothing saved. Bye!' if prompt.no?('Continue anyway?')
        end
      rescue Addressable::URI::InvalidURIError
        nil
      end

      prompt.say "\n"

      # Single user mode 안내만 출력하고, 기본값으로 비활성화
      prompt.say('Single user mode disables registrations and redirects the landing page to your public profile.')
      env['SINGLE_USER_MODE'] = false

      %w(SECRET_KEY_BASE).each do |key|
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

      # 비밀번호는 설정하지 않음 (peer 인증 사용)
      env['DB_PASS'] = ''

      # The chosen database may not exist yet. Connect to default database
      # to avoid "database does not exist" error.
      db_options = {
        adapter: :postgresql,
        database: 'postgres',
        host: env['DB_HOST'],
        port: env['DB_PORT'],
        user: env['DB_USER'],
        password: env['DB_PASS'],
      }

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

      # Redis 설정: 호스트/포트는 고정, 비밀번호 없음
      env['REDIS_HOST'] = 'localhost'
      env['REDIS_PORT'] = 6379

      redis_options = {
        host: env['REDIS_HOST'],
        port: env['REDIS_PORT'],
        driver: :hiredis,
      }

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

      env['SMTP_FROM_ADDRESS'] = "마스토돈 <mastodon@longwhile.xyz>"

      # 테스트 메일은 발송하지 않음

      prompt.say "\n"

      # 업데이트 체크는 항상 비활성화
      env['UPDATE_CHECK_URL'] = ''

      # 4.6 이메일 구독(비로그인 구독자에게 글을 메일로 보냄)은 항상 비활성화
      env['DISABLE_EMAIL_SUBSCRIPTIONS'] = 'true'

      # Multi-account 기본값
      env['MA_MULTI_ACCOUNT_REFRESH_FLOW'] ||= 'true'
      env['MA_MULTI_ACCOUNT_RETAIN_TOKENS'] ||= 'true'
      env['MA_ROLLOUT_PERCENTAGE'] ||= '100'

      # 도메인 기반 multi-account redirect URI 자동 설정
      env['MA_MULTI_ACCOUNT_REDIRECT_URI'] ||= "https://#{env['LOCAL_DOMAIN']}/multi_accounts/callback"

      env['AUTHORIZED_FETCH'] ||= 'true'
      env['LIMITED_FEDERATION_MODE'] ||= 'true'
      env['DISALLOW_UNAUTHENTICATED_API_ACCESS'] ||= 'true'

      LONGWHILE_DEFAULTS.each { |key, value| env[key] ||= value }

      prompt.say "\n"
      prompt.say 'This configuration will be written to .env.production'

      # 항상 저장
      begin
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

        # 데이터베이스 준비는 항상 실행
        prompt.say 'Running `RAILS_ENV=production rails db:prepare` ...'
        prompt.say "\n\n"

        if system(env.transform_values(&:to_s).merge({ 'RAILS_ENV' => 'production', 'SAFETY_ASSURED' => '1' }), 'rails db:prepare')
          prompt.ok 'Database prepared successfully.'
        else
          prompt.error 'Database preparation (`rails db:prepare`) did not complete successfully. Please review the output above.'
          errors << 'Preparing the database failed'
        end

        # Asset compile은 캐시 정리 등을 위해 항상 수동으로 수행
        unless using_docker
          prompt.say "\n"
          prompt.say 'Skipping asset compilation. Run `RAILS_ENV=production rails assets:precompile` manually.'
        end

        prompt.say "\n"

        # Multi-account OAuth client 자동 설정 (항상 실행)
        if db_connection_works
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

          ActiveRecord::Encryption.configure(
            primary_key: ENV.fetch('ACTIVE_RECORD_ENCRYPTION_PRIMARY_KEY'),
            deterministic_key: ENV.fetch('ACTIVE_RECORD_ENCRYPTION_DETERMINISTIC_KEY'),
            key_derivation_salt: ENV.fetch('ACTIVE_RECORD_ENCRYPTION_KEY_DERIVATION_SALT')
          )

          username = prompt.ask('Username:') do |q|
            q.required true
            q.default 'longwhile'
            q.validate(/\A[a-z0-9_]+\z/i)
            q.modify :strip
          end

          email = prompt.ask('E-mail:') do |q|
            q.required true
            q.default 'longwhile.dev@gmail.com'
            q.modify :strip
          end

          password = SecureRandom.hex(16)

          owner_role = UserRole.find_by(name: 'Owner')
          account = Account.find_local(username)

          if account&.user.present?
            user = account.user
            user.update!(email: email, password: password, confirmed_at: Time.now.utc, role: owner_role)
            user.approve! unless user.approved?
            prompt.ok "Existing admin user '#{username}' has been updated with a new password."
          else
            user = User.new(email: email, password: password, confirmed_at: Time.now.utc, account_attributes: { username: username }, bypass_registration_checks: true, role: owner_role)
            user.save(validate: false)
            user.approve!
          end

          Setting.site_contact_username = username

          prompt.ok "You can login with the password: #{password}"
          prompt.warn 'You can change your password once you login.'
        end
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

  namespace :longwhile do
    desc 'Add any missing longwhile settings to .env.production'
    task :env do
      # mastodon:setup 도 이 값을 쓰지만 그것은 새로 설치할 때만 돌릴 수 있다 —
      # .env.production 을 통째로 다시 쓰기 때문에, 돌아가는 서버에서 돌리면
      # SECRET_KEY_BASE 와 VAPID 키가 갈려 전원이 로그아웃된다. 이 태스크는
      # 업그레이드용이다. 없는 것만 덧붙이고 이미 있는 줄은 건드리지 않는다.
      env_path = Rails.root.join('.env.production')

      unless env_path.exist?
        warn "#{env_path} 이 없습니다. 먼저 `rails mastodon:setup` 을 돌리십시오."
        exit 1
      end

      contents = env_path.read
      added = LONGWHILE_DEFAULTS.reject { |key, _| contents.match?(/^\s*#{Regexp.escape(key)}=/) }

      if added.empty?
        puts '더할 것이 없습니다. .env.production 에 이미 다 들어 있습니다.'
        next
      end

      contents << "\n" unless contents.end_with?("\n")
      contents << "\n# mastodon:longwhile:env 가 #{Time.now.utc} 에 추가\n"
      added.each { |key, value| contents << "#{key}=#{dotenv_escape(value)}\n" }

      env_path.write(contents)

      added.each_key { |key| puts "추가: #{key}" }
      puts "\n적용하려면 재시작하십시오:"
      puts '  sudo systemctl restart mastodon-web mastodon-sidekiq mastodon-streaming'
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
