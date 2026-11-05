// @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
//   방별 초안의 저장소.
//   근거: dm-chat-phase-3.md §4, 기획서 §4.4.5·§11.5
//
//   **키에 계정 id 를 넣는다.** 이 저장소에는 다중 계정 전환기가 있어(api.ts 의
//   activeAccountToken), 키가 방 id 뿐이면 계정을 바꿨을 때 남의 초안이 그대로
//   입력창에 뜬다.
//
//   **로그아웃하면 전부 지운다** (utils/log_out.ts). 공용 기기에서 다음 사람이
//   읽을 수 있다.

const PREFIX = 'dm_draft:';

// 사파리 비공개 모드처럼 접근 자체가 예외를 던지는 환경이 있다. 초안은 없어도
// 되는 편의 기능이므로 저장소가 없으면 조용히 포기한다.
const storage = (): Storage | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const keyFor = (accountId: string, roomId: string) =>
  `${PREFIX}${accountId}:${roomId}`;

export const readDrafts = (accountId: string | undefined) => {
  const drafts: Record<string, string> = {};
  const store = storage();

  if (!store || !accountId) return drafts;

  const scope = `${PREFIX}${accountId}:`;

  try {
    for (let index = 0; index < store.length; index += 1) {
      const key = store.key(index);

      if (!key?.startsWith(scope)) continue;

      const value = store.getItem(key);

      if (value) drafts[key.slice(scope.length)] = value;
    }
  } catch {
    return drafts;
  }

  return drafts;
};

export const writeDraft = (
  accountId: string | undefined,
  roomId: string,
  text: string,
) => {
  const store = storage();

  if (!store || !accountId) return;

  try {
    // 빈 초안을 남겨두면 목록 미리보기가 "임시저장: " 만 남은 상태가 된다.
    if (text.trim() === '') store.removeItem(keyFor(accountId, roomId));
    else store.setItem(keyFor(accountId, roomId), text);
  } catch {
    // 용량 초과 등. 초안은 잃어도 되는 값이다.
  }
};

// 로그아웃 시 호출한다. 계정을 가리지 않고 이 브라우저의 초안을 전부 지운다 —
// 다중 계정 세션이 함께 끊기므로 남겨둘 이유가 없다.
export const clearDrafts = () => {
  const store = storage();

  if (!store) return;

  try {
    const keys: string[] = [];

    for (let index = 0; index < store.length; index += 1) {
      const key = store.key(index);

      if (key?.startsWith(PREFIX)) keys.push(key);
    }

    keys.forEach((key) => {
      store.removeItem(key);
    });
  } catch {
    // 위와 같다.
  }
};
