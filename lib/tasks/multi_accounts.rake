# frozen_string_literal: true

namespace :multi_accounts do
  desc 'Ensure OAuth client for multi-account switcher exists'
  task ensure_client: :environment do
    config = Rails.configuration.x.multi_account

    unless config[:redirect_uri].present?
      Rails.logger.error 'Multi-account redirect URI missing. Please set MA_MULTI_ACCOUNT_REDIRECT_URI environment variable or configure settings.'
      exit 1
    end

    client_id = config[:client_id]
    client_secret = config[:client_secret]
    created_new = false

    if client_id.blank? || client_secret.blank?
      app = Doorkeeper::Application.create!(
        name: 'Web',
        redirect_uri: config[:redirect_uri],
        scopes: 'read write follow push'
      )

      client_id = app.uid
      client_secret = app.secret
      created_new = true

      puts 'Created new multi-account OAuth application.'
      puts "MA_MULTI_ACCOUNT_CLIENT_ID=#{client_id}"
      puts "MA_MULTI_ACCOUNT_CLIENT_SECRET=#{client_secret}"
      puts "MA_MULTI_ACCOUNT_REDIRECT_URI=#{config[:redirect_uri]}"
    else
      app = Doorkeeper::Application.find_or_initialize_by(uid: client_id)
      app.name = 'Web'
      app.redirect_uri = config[:redirect_uri]
      app.scopes = 'read write follow push'
      app.secret = client_secret if app.new_record?

      if app.save
        puts "Verified multi-account client: #{app.uid}"
        puts "Redirect URI: #{app.redirect_uri}"
        puts "Scopes: #{app.scopes}"
      else
        Rails.logger.error "Failed to save multi-account client: #{app.errors.full_messages.join(', ')}"
        exit 1
      end
    end

    # .env.production에 자동으로 추가
    env_path = Rails.root.join('.env.production')
    if env_path.exist?
      contents = env_path.read

      # client_id가 없으면 추가
      unless contents.match?(/^MA_MULTI_ACCOUNT_CLIENT_ID=/)
        contents << "\nMA_MULTI_ACCOUNT_CLIENT_ID=#{dotenv_escape(client_id)}"
        puts "\nAdded MA_MULTI_ACCOUNT_CLIENT_ID to .env.production"
      end

      # client_secret이 없으면 추가
      unless contents.match?(/^MA_MULTI_ACCOUNT_CLIENT_SECRET=/)
        contents << "\nMA_MULTI_ACCOUNT_CLIENT_SECRET=#{dotenv_escape(client_secret)}"
        puts "Added MA_MULTI_ACCOUNT_CLIENT_SECRET to .env.production"
      end

      env_path.write("#{contents}\n")
      puts "\nConfiguration saved to .env.production"
    else
      puts "\nWarning: .env.production not found. Please manually add the above environment variables."
    end
  end
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
