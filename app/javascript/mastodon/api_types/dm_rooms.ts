// @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
// See app/serializers/rest/dm_room_serializer.rb

import type { ApiAccountJSON } from './accounts';
import type { ApiStatusJSON } from './statuses';

export interface ApiDmRoomJSON {
  id: string;
  accounts: ApiAccountJSON[];
  last_status?: ApiStatusJSON | null;
  unread_count: number;

  // 답장 기준. 클라이언트가 추측하지 않는다 — 방이 conversation 여럿을 묶으므로
  // 루트가 자명하지 않다. null 이면 메시지가 없는 방이고, 그때는 in_reply_to 없이
  // 새 스레드를 시작한다.
  root_status_id: string | null;

  // "여기까지 읽음" 구분선의 기준. **내** 커서다.
  last_read_status_id: string | null;

  // 남들이 어디까지 읽었는가. (FR-16, docs/dm-chat/phases/dm-chat-phase-4.md §2.2)
  //
  // **읽음 표시를 켜 둔 다른 멤버가 전부 들어 있다.** 아직 한 번도 안 읽은
  // 사람도 `last_read_status_id: null` 로 들어온다 — 화면이 "안 읽은 사람 수" 를
  // 세므로, 빠지면 아무도 안 읽었는데 0 명이 되어 숫자가 곧바로 사라진다.
  //
  // **읽은 시각은 오지 않는다.** 서버가 일부러 뺀다 — 시각은 접속 패턴을
  // 드러낸다(기획서 §11.2).
  //
  // 상호주의(FR-19)로 막히면 **빈 배열**이다. 필드가 사라지지 않는 것이 중요하다.
  // 없어지면 상대의 설정 상태가 추론된다. 읽음 표시를 끈 사람도 빠지므로 세는
  // 대상이 아니다 — 알 수 없는 것을 "안 읽음" 으로 세면 영영 0 이 되지 않는다.
  //
  // optional 로 둔 것은 서버가 먼저 배포되지 않은 경우를 위해서다. 옛 서버가 이
  // 필드를 안 주면 숫자만 안 나올 뿐 화면은 그대로 돈다.
  participant_read_states?: ApiDmReadStateJSON[];

  is_group: boolean;
  is_local: boolean;
  title: string | null;

  // 방을 만든 사람. **"그룹에서 삭제하기" 를 할 수 있는 유일한 사람이다.**
  //
  // null 이면 이 값이 생기기 전(2026-08-12)에 만들어진 방이고, 루트 메시지
  // 작성자로 메꾸지 못한 경우다. 그런 방에서는 아무도 내보낼 수 없다 — 모르는
  // 것을 아무에게나 주지 않는다.
  creator_id?: string | null;

  // **내가** 이 방에서 지정한 별명. `{ 대상 계정 id: 별명 }`.
  // 남이 지정한 것은 오지 않는다. 별명은 내 화면을 정리하는 수단이다.
  nicknames?: Record<string, string>;
}

export interface ApiDmReadStateJSON {
  account_id: string;

  // null 이면 **한 번도 읽지 않았다.** 어떤 메시지보다도 뒤에 있는 것으로 센다.
  last_read_status_id: string | null;
}
