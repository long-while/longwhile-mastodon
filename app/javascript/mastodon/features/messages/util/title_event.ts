// @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
//   방 제목 변경 안내. (Phase 5, docs/dm-chat/phases/dm-chat-phase-5.md §3.2)
//
//   서버는 이 안내를 **평범한 direct status** 로 남긴다. 별도 테이블도 별도
//   엔드포인트도 없다 — 그래야 시간순 위치가 저절로 잡히고, 스트리밍과 방 귀속
//   경로를 그대로 타고, 다른 클라이언트에서도 깨지지 않는다.
//
//   표식은 `spoiler_text` 에 있고 본문에는 사람이 읽는 문장이 들어 있다.
//
//     spoiler_text  "conversation:title_changed:"
//     본문           "○○ 님이 대화 제목을 '새 제목' 으로 바꿨습니다."
//
//   우리 화면은 표식을 보고 말풍선 대신 가운데 안내문으로 그린다. 공식 앱은 CW
//   붙은 DM 으로 보고, 펼치면 한국어 문장이 그대로 읽힌다.
//
//   **서버에도 같은 문자열이 있다** (`DmRoom::TITLE_EVENT_PREFIX`). 한쪽만
//   고치면 표식이 화면에 그대로 나온다.
export const TITLE_EVENT_PREFIX = 'conversation:title_changed:';

// 멤버가 바뀌었다는 안내. 같은 방식이다 (`DmRoom::MEMBER_EVENT_PREFIX`).
//
//   spoiler_text  "conversation:members_changed:"
//   본문           "○○ 님이 △△ 님을 초대했습니다."
export const MEMBER_EVENT_PREFIX = 'conversation:members_changed:';

export const isTitleEvent = (spoilerText: string | undefined | null) =>
  Boolean(spoilerText?.startsWith(TITLE_EVENT_PREFIX));

export const isMemberEvent = (spoilerText: string | undefined | null) =>
  Boolean(spoilerText?.startsWith(MEMBER_EVENT_PREFIX));

// 말풍선이 아니라 가운데 정렬 안내문으로 그릴 것. 표식이 늘어날 때 화면 쪽에서
// `||` 를 이어 붙이지 않도록 여기 하나로 모은다 — 빠뜨리면 표식 문자열이 그대로
// 화면에 나온다.
export const isSystemEvent = (spoilerText: string | undefined | null) =>
  isTitleEvent(spoilerText) || isMemberEvent(spoilerText);
