# frozen_string_literal: true

# @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
#   개발·스테이징에서 채팅 화면을 검증하려면 두 계정과 깊게 쌓인 방이 필요하다.
#   수작업으로는 경계 조건(첨부만, CW만, 긴 한 단어, 개행만, 삭제된 마지막 메시지)을
#   만들기 번거로워 QA 에서 건너뛰기 쉬우므로 시드에 포함한다.
#   근거: dm-chat-phase-0.md P0-4
#
#   `bin/rails dm:seed` 로 실행한다. 환경 가드는 이 클래스의 guard_environment! 에 있다.
module Mastodon
  class DmSeeder
    DEFAULT_USERNAME_PREFIX = 'dmtest'

    # 두 계정이 없으면 방을 만들 수 없다.
    MINIMUM_ACCOUNTS = 2

    # 아주 긴 한 단어. 말풍선이 가로로 터지는지 보는 케이스.
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

    # 가드를 클래스 안에 둔다. rake 에만 두면 `bin/rails runner` 나 콘솔에서 그냥
    # 비켜갈 수 있는데, 이 클래스는 계정을 만들고 익명 처리까지 하므로 쓰기 지점에서
    # 막아야 한다.
    #
    # 우회 토큰으로 `true` 같은 값을 받지 않는다. 스테이징과 운영이 같은 템플릿에서
    # 배포되면 `ALLOW_DM_SEED=true` 가 그대로 운영에 복사되어 가드가 영구히 꺼진다.
    # 그 서버의 LOCAL_DOMAIN 을 정확히 적게 해서, 복사된 값이 다른 서버에서는 통하지
    # 않게 한다.
    def guard_environment!
      return if Rails.env.local?

      expected = Rails.configuration.x.local_domain
      return if ENV['ALLOW_DM_SEED'].present? && ENV['ALLOW_DM_SEED'] == expected

      raise "개발·테스트 환경이 아닙니다. 정말 실행하려면 ALLOW_DM_SEED=#{expected} 를 주십시오."
    end

    # 1:1 방의 개수는 상대 계정 수를 넘을 수 없다. ROOMS=40 만 주고 ACCOUNTS 를 그대로
    # 두면 같은 상대에게 여러 번 보내 방이 늘지 않는다.
    def warn_about_room_count
      available = @account_count - 1
      return if @room_count <= available

      say "경고: ROOMS=#{@room_count} 인데 상대가 #{available}명뿐입니다. 방은 #{available}개까지만 생깁니다. ACCOUNTS=#{@room_count + 1} 로 다시 실행하세요."
    end

    # 기본 비밀번호를 코드에 두지 않는다. 저장소나 문서에 적힌 값은 곧 시드가 돌아간
    # 모든 인스턴스의 공용 계정 비밀번호가 되고, 그 계정들은 confirmed·approved 상태라
    # 가입 승인 게이트까지 지나 있다. 주지 않으면 매 실행마다 새로 만든다.
    def password
      @password ||= ENV['DM_SEED_PASSWORD'].presence || SecureRandom.hex(16)
    end

    def generated_password?
      ENV['DM_SEED_PASSWORD'].blank?
    end

    def username_prefix
      @username_prefix ||= ENV.fetch('DM_SEED_USERNAME_PREFIX', DEFAULT_USERNAME_PREFIX)
    end

    # `.invalid` 는 MX 레코드가 없다. EmailMxValidator 는 개발·테스트에서만 건너뛰므로,
    # RAILS_ENV=production 인 스테이징에 심으려면 실제로 MX 가 있는 도메인을 넘겨야 한다.
    def email_domain
      @email_domain ||= ENV.fetch('DM_SEED_EMAIL_DOMAIN', 'dm-seed.invalid')
    end

    def ensure_accounts
      (1..@account_count).map do |index|
        username = "#{username_prefix}#{index}"
        account  = Account.find_by(username: username, domain: nil)

        if account.present?
          # 이미 있는 계정을 말없이 가져다 쓰지 않는다. 운영 덤프를 스테이징에 올린
          # 뒤 시드를 돌리면, 우연히 이름이 겹친 진짜 사용자의 계정으로 글이 써지고
          # 심지어 익명 처리까지 된다(되돌릴 수 없다). 시드가 만든 계정인지 이메일
          # 도메인으로 확인하고, 아니면 멈춘다.
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

    # 방 하나에 메시지를 깊게 쌓는다. 폐쇄형 소규모 운영에서 실제 부하가 나는 형태.
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

    # 목록 화면용. 상대를 바꿔가며 방 개수를 늘린다.
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

    # 기획서 §10.2 의 경계 조건.
    def seed_edge_cases(sender, recipient)
      say '경계 조건 데이터 생성 중...'

      post(sender, recipient, LONG_WORD)
      post(sender, recipient, "\n\n\n\n\n\n")
      post(sender, recipient, '', spoiler_text: '내용 경고만 있고 본문이 없는 메시지')

      # 마지막 메시지를 지운 상태. 목록 미리보기가 이전 메시지로 되감기는지 본다.
      # original_removed 로 원격 배달(Delete 액티비티)을 막는다. 시드가 바깥으로 나가는
      # 트래픽을 만들면 안 된다.
      doomed = post(sender, recipient, '이 메시지는 곧 삭제됩니다')
      RemoveStatusService.new.call(doomed, original_removed: true)

      say '  첨부만 있는 메시지는 미디어 업로드가 필요해 시드에서 만들지 않습니다. 화면에서 직접 올려 확인하세요.'
    end

    # 상대가 익명 처리된 방. 헤더와 말풍선이 "탈퇴한 사용자" 로 표시되는지, 방이 열리는지
    # 확인한다. (dm-chat-decisions.md D-06)
    #
    # 익명 처리는 되돌릴 수 없다(되살리는 코드가 저장소에 없다). 그래서 다른 시나리오와
    # 계정을 공유하지 않고, 이 케이스 전용 계정을 새로 만들어 그것만 익명 처리한다.
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

    # 시드가 만든 계정인지 판정한다. 이메일 도메인이 유일한 표식이다.
    def seeded?(account)
      account.user&.email.to_s.end_with?("@#{email_domain}")
    end

    # 시드는 오래 돌기 때문에 진행 상황이 콘솔에 보여야 한다. Rails/Output 을 피하려고
    # $stdout 을 직접 쓴다.
    def say(message)
      $stdout.puts(message)
    end
  end
end
