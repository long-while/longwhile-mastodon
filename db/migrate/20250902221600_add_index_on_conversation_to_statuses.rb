# frozen_string_literal: true

class AddIndexOnConversationToStatuses < ActiveRecord::Migration[8.0]
  disable_ddl_transaction!

  def change
    # @_longwhile — 이 포크의 DM 채팅이 같은 이름·같은 정의의 인덱스를 먼저 만들었다
    #   (20260810100000_add_conversation_id_index_to_statuses). 그대로 두면 운영 DB 에서
    #   "already exists" 로 이 뒤의 마이그레이션이 모두 멈춘다.
    add_index :statuses, :conversation_id, algorithm: :concurrently, if_not_exists: true
  end
end
