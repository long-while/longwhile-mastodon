# frozen_string_literal: true

# @_longwhile custom feature

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
          if Status.unscoped.exists?(id: conversation.last_status_id)
            skipped += 1
          elsif AccountConversation::REFILL_SCAN_LIMIT
            skipped += 1
            $stdout.puts "  ? id=#{conversation.id} 는 last_status 가 사라졌지만 창 안에서 대체를 못 찾았습니다. STATUS_IDS_LIMIT=0 으로 다시 돌리십시오."
          else
            conversation.destroy!
            repaired += 1
          end
        elsif rebuilt != conversation.status_ids
          conversation.status_ids = rebuilt
          conversation.save!
          changed += 1
        end
      rescue => e
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
        member_ids = conversation.participant_account_ids + [conversation.account_id]

        if member_ids.uniq.size < 2
          processed += 1
          next
        end

        room = DmRoom.find_or_create_for(member_ids)

        room.attach_conversation!(conversation.conversation_id)
        attached += 1

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

  desc '개발·스테이징용 DM 테스트 데이터 생성'
  task seed: :environment do
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
