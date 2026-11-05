# frozen_string_literal: true

# @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
#   dm:rebuild_status_ids  account_conversations.status_ids 재구성 (상한 롤백용)
#   dm:repair_misplaced    다른 방의 스레드에 잘못 들어간 메시지를 제 방으로 옮김
#   dm:seed                개발·스테이징용 테스트 데이터 생성
#   근거: dm-chat-phase-0.md P0-2 §2.4, P0-4

namespace :dm do
  desc 'account_conversations.status_ids 를 statuses 로부터 다시 채운다 (STATUS_IDS_LIMIT 롤백용)'
  task rebuild_status_ids: :environment do
    batch_size = (ENV['BATCH_SIZE'] || 1_000).to_i
    start_id   = ENV['START_ID'].presence&.to_i
    processed  = 0
    changed    = 0
    skipped    = 0
    repaired   = 0
    failed     = 0
    last_id    = nil

    limit_label = AccountConversation::STATUS_IDS_LIMIT.positive? ? AccountConversation::STATUS_IDS_LIMIT.to_s : '무제한'
    $stdout.puts "STATUS_IDS_LIMIT=#{limit_label} 기준으로 재구성합니다."
    $stdout.puts '상한을 완전히 되돌리려면 STATUS_IDS_LIMIT=0 으로 실행하세요.' if AccountConversation::STATUS_IDS_LIMIT.positive?
    $stdout.puts "id >= #{start_id} 부터 재개합니다." if start_id

    scope = AccountConversation.all
    scope = scope.where(id: start_id..) if start_id

    scope.find_each(batch_size: batch_size) do |conversation|
      last_id = conversation.id

      begin
        rebuilt = AccountConversation.remaining_status_ids(conversation)

        if rebuilt.empty?
          # 되찾을 메시지가 없다. 두 경우를 구분한다.
          #
          #   last_status 가 아직 있다  버려졌을 뿐 남아 있는 대화다. 건드리지 않는다.
          #                            재구성은 복구 도구이지 정리 도구가 아니다.
          #   last_status 가 사라졌다  뜬 참조다. belongs_to :last_status 가 required 라
          #                            이 행은 update 마다 예외를 낸다. 지운다.
          if Status.unscoped.exists?(id: conversation.last_status_id)
            skipped += 1
          elsif AccountConversation::REFILL_SCAN_LIMIT
            # 되찾기가 창(REFILL_SCAN_LIMIT) 안에서만 돌았으므로 "정말 0건" 이라고
            # 단정할 수 없다. 창 밖에 메시지가 남아 있는데 지우면 데이터 손실이다.
            # 수리는 STATUS_IDS_LIMIT=0 으로 다시 돌릴 때만 한다.
            skipped += 1
            $stdout.puts "  ? id=#{conversation.id} 는 last_status 가 사라졌지만 창 안에서 대체를 못 찾았습니다. STATUS_IDS_LIMIT=0 으로 다시 돌리십시오."
          else
            conversation.destroy!
            repaired += 1
          end
        elsif rebuilt != conversation.status_ids
          # set_last_status 콜백이 정렬·중복 제거·상한을 다시 적용하고 last_status_id 도
          # 함께 맞춘다. 여기서는 원본만 넣는다.
          conversation.status_ids = rebuilt
          conversation.save!
          changed += 1
        end
      rescue => e
        # 한 행 때문에 전체가 죽으면 어디까지 처리했는지 알 수 없게 된다.
        failed += 1
        $stdout.puts "  ! id=#{conversation.id} 실패: #{e.class} #{e.message}"
      end

      processed += 1
      $stdout.puts "  #{processed}건 처리 (변경 #{changed} / 건너뜀 #{skipped} / 정리 #{repaired} / 실패 #{failed}), 마지막 id=#{last_id}" if (processed % batch_size).zero?
    end

    $stdout.puts "완료. #{processed}건 처리, 변경 #{changed}, 건너뜀 #{skipped}, 정리 #{repaired}, 실패 #{failed}."
    $stdout.puts "중단되었다면 START_ID=#{last_id} 로 재개하세요." if last_id
  end

  desc '기존 DM 대화를 방(dm_rooms)에 백필한다'
  task backfill_rooms: :environment do
    batch_size = (ENV['BATCH_SIZE'] || 500).to_i
    start_id   = ENV['START_ID'].presence&.to_i
    processed  = 0
    attached   = 0
    failed     = 0
    last_id    = nil

    $stdout.puts 'account_conversations 를 순회하며 방을 만들고 conversation 을 붙입니다.'
    $stdout.puts "id >= #{start_id} 부터 재개합니다." if start_id

    scope = AccountConversation.all
    scope = scope.where(id: start_id..) if start_id

    scope.find_each(batch_size: batch_size) do |conversation|
      last_id = conversation.id

      begin
        # participant_account_ids 는 수신자 본인을 뺀 목록이다. 방의 키는 본인을
        # 포함해야 하므로 여기서 정규화한다. 이 차이를 놓치면 백필 결과가 통째로
        # 어긋난다. (dm-chat-phase-1.md §1.3)
        member_ids = conversation.participant_account_ids + [conversation.account_id]

        if member_ids.uniq.size < 2
          processed += 1
          next
        end

        room = DmRoom.find_or_create_for(member_ids)

        # 이미 붙어 있으면 update_all 이 0행을 고친다. 재실행해도 중복 방이 생기지
        # 않는다.
        room.attach_conversation!(conversation.conversation_id)
        attached += 1

        # 방에 실제로 속한 글로만 last_status 를 세운다. conversation 안에는 답글로
        # 딸려 들어온 다른 공개 범위의 글이나 멘션 구성이 다른 글이 섞여 있는데,
        # 그것을 방의 마지막 메시지로 잡으면 목록 미리보기가 전 멤버에게 그 내용을
        # 보여준다. rewind_last_status! 가 참여자 조합까지 확인한다.
        room.rewind_last_status!
      rescue => e
        failed += 1
        $stdout.puts "  ! id=#{conversation.id} 실패: #{e.class} #{e.message}"
      end

      processed += 1
      $stdout.puts "  #{processed}건 처리 (귀속 #{attached} / 실패 #{failed}), 마지막 id=#{last_id}" if (processed % batch_size).zero?
    end

    $stdout.puts "완료. #{processed}건 처리, 귀속 #{attached}, 실패 #{failed}."
    $stdout.puts "중단되었다면 START_ID=#{last_id} 로 재개하세요." if last_id

    Rake::Task['dm:verify_backfill'].invoke
  end

  desc '백필 결과를 검증한다'
  task verify_backfill: :environment do
    orphan_conversations = Conversation
                           .where(dm_room_id: nil)
                           .where(id: Status.direct_visibility.select(:conversation_id))
                           .count

    rooms_without_members = DmRoom.where.missing(:dm_room_members).count
    rooms_with_one_member = DmRoom.where(member_count: ..1).count
    rooms_without_status  = DmRoom.where(last_status_id: nil).count

    $stdout.puts ''
    $stdout.puts '백필 검증'
    $stdout.puts "  direct 글이 있는데 방에 안 붙은 conversation: #{orphan_conversations}  (0 이어야 합니다)"
    $stdout.puts "  멤버가 없는 방: #{rooms_without_members}  (0 이어야 합니다)"
    $stdout.puts "  멤버가 1명 이하인 방: #{rooms_with_one_member}  (이상 데이터 탐지용)"
    $stdout.puts "  마지막 메시지가 없는 방: #{rooms_without_status}  (메시지 없는 방을 빼면 0)"
    $stdout.puts "  방 개수: #{DmRoom.count}"
    $stdout.puts ''
    passed = orphan_conversations.zero? && rooms_without_members.zero?
    $stdout.puts passed ? '통과' : '실패 — 위 숫자를 확인하세요.'
  end

  # 기본은 미리보기다. 무엇을 옮길지 확인한 뒤 APPLY=true 로 다시 돌린다.
  # 두 번 돌려도 된다 — 옮긴 메시지는 제 방에 붙어 다음 실행에서 걸리지 않는다.
  desc '다른 방의 스레드에 잘못 들어간 DM 을 제 방으로 옮긴다 (APPLY=true 로 실행)'
  task repair_misplaced: :environment do
    apply  = ENV['APPLY'] == 'true'
    result = RepairDmRoomThreadsService.new.call(apply: apply)

    $stdout.puts apply ? '적용합니다.' : '미리보기입니다. 아무것도 바꾸지 않습니다. 적용하려면 APPLY=true 로 다시 실행하세요.'
    $stdout.puts ''

    result.moves.each do |move|
      $stdout.puts "  옮김  conversation #{move.conversation_id} (방 #{move.source_room.id}) → 방 #{move.target_room.id} : 글 #{move.statuses.map(&:id).join(', ')}"
    end

    reasons = {
      room_history: '그 방의 정상 이력(멤버 변경 전)',
      edited: '수정된 메시지 — 직접 확인 필요',
      no_room_for_participants: '같은 참여자의 방이 없음',
    }

    result.skips.each do |skip|
      reason = reasons.fetch(skip.reason)
      $stdout.puts "  둠    conversation #{skip.conversation_id} (방 #{skip.source_room.id}) : 글 #{skip.status_ids.join(', ')} — #{reason}"
    end

    $stdout.puts "  루트·최신 글을 다시 계산한 방: #{result.healed_room_ids.join(', ')}" if result.healed_room_ids.any?
    $stdout.puts ''
    $stdout.puts "옮길 묶음 #{result.moves.size}, 그대로 둔 묶음 #{result.skips.size}, 다시 계산한 방 #{result.healed_room_ids.size}."
  end

  desc '개발·스테이징용 DM 테스트 데이터 생성'
  task seed: :environment do
    # 환경 가드는 Mastodon::DmSeeder#call 안에 있다. 여기에 또 두면 두 조건이
    # 서로 다른 ALLOW_DM_SEED 값을 요구해 정상 경로가 막힌다. 가드는 쓰기 지점
    # 하나에만 둔다 — 콘솔이나 `bin/rails runner` 로도 비켜갈 수 없어야 한다.
    require_relative '../mastodon/dm_seeder'

    Mastodon::DmSeeder.new(
      accounts: (ENV['ACCOUNTS'] || 5).to_i,
      messages: (ENV['MESSAGES'] || 200).to_i,
      rooms: (ENV['ROOMS'] || 5).to_i,
      group: ENV['GROUP'] != 'false',
      edge_cases: ENV['EDGE_CASES'] != 'false'
    ).call
  end
end
