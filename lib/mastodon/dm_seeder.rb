# frozen_string_literal: true

# @_longwhile custom feature
module Mastodon
  class DmSeeder
    DEFAULT_USERNAME_PREFIX = 'dmtest'

    MINIMUM_ACCOUNTS = 2

    LONG_WORD = ('가나다라마바사' * 40)

    def initialize(accounts:, messages:, rooms:, group:, edge_cases:)
      @account_count = [accounts, MINIMUM_ACCOUNTS].max
      @message_count = messages
      @room_count    = rooms
      @group         = group
      @edge_cases    = edge_cases
    end

    def call
      guard_environment!
      warn_about_room_count

      accounts = ensure_accounts

      say "계정 #{accounts.size}개 준비 완료: #{accounts.map(&:username).join(', ')}"

      seed_deep_room(accounts[0], accounts[1])
      seed_wide_rooms(accounts[0], accounts.drop(1))
      seed_group_room(accounts.first(3)) if @group && accounts.size >= 3
      seed_edge_cases(accounts[0], accounts[1]) if @edge_cases
      seed_anonymized_room(accounts[0]) if @edge_cases

      say '완료. 만들어진 계정은 아래와 같습니다.'
      accounts.each { |account| say "  #{account.username}@#{Rails.configuration.x.local_domain}" }

      if generated_password?
        say ''
        say "이번 실행의 비밀번호: #{password}"
        say '무작위로 만들었습니다. 고정하려면 DM_SEED_PASSWORD 를 주십시오.'
      end

      say '숨긴 방(FR-27) 시드는 dm_room_members 가 생기는 Phase 1 이후에 추가합니다.'
    end

    private

    def guard_environment!
      return if Rails.env.local?

      expected = Rails.configuration.x.local_domain
      return if ENV['ALLOW_DM_SEED'].present? && ENV['ALLOW_DM_SEED'] == expected

      raise "개발·테스트 환경이 아닙니다. 정말 실행하려면 ALLOW_DM_SEED=#{expected} 를 주십시오."
    end

    def warn_about_room_count
      available = @account_count - 1
      return if @room_count <= available

      say "경고: ROOMS=#{@room_count} 인데 상대가 #{available}명뿐입니다. 방은 #{available}개까지만 생깁니다. ACCOUNTS=#{@room_count + 1} 로 다시 실행하세요."
    end

    def password
      @password ||= ENV['DM_SEED_PASSWORD'].presence || SecureRandom.hex(16)
    end

    def generated_password?
      ENV['DM_SEED_PASSWORD'].blank?
    end

    def username_prefix
      @username_prefix ||= ENV.fetch('DM_SEED_USERNAME_PREFIX', DEFAULT_USERNAME_PREFIX)
    end

    def email_domain
      @email_domain ||= ENV.fetch('DM_SEED_EMAIL_DOMAIN', 'dm-seed.invalid')
    end

    def ensure_accounts
      (1..@account_count).map do |index|
        username = "#{username_prefix}#{index}"
        account  = Account.find_by(username: username, domain: nil)

        if account.present?
          raise "#{username} 은 시드가 만든 계정이 아닙니다. DM_SEED_USERNAME_PREFIX 로 다른 접두사를 주거나, 그 계정을 먼저 확인하십시오." unless seeded?(account)

          next account
        end

        user = User.new(
          email: "#{username}@#{email_domain}",
          password: password,
          confirmed_at: Time.now.utc,
          approved: true,
          agreement: true,
          account_attributes: { username: username, display_name: "DM 테스트 #{index}" }
        )
        user.save!
        user.account
      end
    end

    def seed_deep_room(sender, recipient)
      say "#{sender.username} ↔ #{recipient.username} 방에 #{@message_count}건 생성 중..."

      root = post(sender, recipient, '깊은 방 시드 시작')

      (1...@message_count).each do |index|
        author = index.even? ? recipient : sender
        other  = index.even? ? sender : recipient
        post(author, other, "메시지 #{index}", in_reply_to: root)

        say "  #{index}건" if (index % 100).zero?
      end
    end

    def seed_wide_rooms(account, others)
      return if others.empty?

      targets = (0...@room_count).map { |index| others[index % others.size] }

      say "#{account.username} 의 방 #{targets.uniq.size}개 생성 중..."

      targets.each_with_index do |other, index|
        post(account, other, "방 #{index + 1} 의 첫 메시지")
      end
    end

    def seed_group_room(members)
      say "그룹 방 생성 중 (#{members.map(&:username).join(', ')})..."

      root = post(members[0], members.drop(1), '그룹 방 시드')
      post(members[1], [members[0], members[2]], '그룹 두 번째 메시지', in_reply_to: root)
    end

    def seed_edge_cases(sender, recipient)
      say '경계 조건 데이터 생성 중...'

      post(sender, recipient, LONG_WORD)
      post(sender, recipient, "\n\n\n\n\n\n")
      post(sender, recipient, '', spoiler_text: '내용 경고만 있고 본문이 없는 메시지')

      doomed = post(sender, recipient, '이 메시지는 곧 삭제됩니다')
      RemoveStatusService.new.call(doomed, original_removed: true)

      say '  첨부만 있는 메시지는 미디어 업로드가 필요해 시드에서 만들지 않습니다. 화면에서 직접 올려 확인하세요.'
    end

    def seed_anonymized_room(account)
      victim = anonymized_victim
      return if victim.nil?

      say "익명 계정 방 생성 중 (#{victim.username})..."

      post(account, victim, '익명 처리 전에 오간 메시지')
      post(victim, account, '익명 처리될 계정이 보낸 메시지')

      victim.update!(anonymized_at: Time.now.utc)
    end

    def anonymized_victim
      username = "#{username_prefix}anon"
      existing = Account.find_by(username: username, domain: nil)

      if existing.present?
        return existing if seeded?(existing)

        say "  건너뜀: #{username} 이 시드가 만든 계정이 아닙니다."
        return nil
      end

      user = User.new(
        email: "#{username}@#{email_domain}",
        password: password,
        confirmed_at: Time.now.utc,
        approved: true,
        agreement: true,
        account_attributes: { username: username, display_name: '익명 처리 대상' }
      )
      user.save!
      user.account
    end

    def post(author, recipients, text, in_reply_to: nil, spoiler_text: nil)
      mentions = Array(recipients).map { |account| "@#{account.username}" }.join(' ')

      PostStatusService.new.call(
        author,
        text: [mentions, text].compact_blank.join(' '),
        visibility: :direct,
        thread: in_reply_to,
        spoiler_text: spoiler_text
      )
    end

    def seeded?(account)
      account.user&.email.to_s.end_with?("@#{email_domain}")
    end

    def say(message)
      $stdout.puts(message)
    end
  end
end
