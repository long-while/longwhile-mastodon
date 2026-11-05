// @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
//   새 메시지를 어느 글에 답글로 달지.
//
//   **방의 가장 최근 메시지에 단다.** 예전에는 방의 루트(D-03)에 달았는데, 웹
//   채팅 화면은 시간순으로 그려서 멀쩡해 보여도 Tusky·Moshidon 같은 일반 클라이언트는
//   답글 관계로 타래를 그리므로 웹에서 보낸 메시지가 전부 첫 메시지 아래로 갈라져
//   보였다(2026-11 문의). 휴대폰 앱은 원래 직전 글에 답하므로 이제 양쪽이 같다.
//
//   루트는 그대로 서버가 정하고, 최근 메시지를 모를 때(빈 방, 직전 글이 지워짐)의
//   대체 대상으로만 쓴다.

import { compareIds } from './compare_ids';

// 둘 중 더 나중 id. 어느 한쪽이 없으면 있는 쪽.
export const newerId = (a?: string | null, b?: string | null) => {
  if (!a) return b ?? undefined;
  if (!b) return a;

  return compareIds(a, b) >= 0 ? a : b;
};

// 화면이 아는 최근 메시지 → 없으면 방의 루트 → 둘 다 없으면 새 스레드.
export const replyTargetFor = (
  latestStatusId: string | undefined,
  rootStatusId: string | null | undefined,
) => latestStatusId ?? rootStatusId ?? undefined;

// 웹 화면에서 이 메시지를 "다른 메시지를 짚은 답장" 으로 볼지. 그런 메시지는 앞
// 메시지와 말풍선을 묶지 않는다(group_messages.ts).
//
// 루트에 단 것(예전 웹 방식)과 **바로 앞 메시지에 단 것**(지금 웹 방식, 휴대폰 앱)은
// 그냥 이어서 말한 것이다. 바로 앞만 보면 충분하다 — 묶기는 바로 앞 메시지가 같은
// 사람일 때만 일어나므로, 사이에 다른 사람의 메시지가 끼면 어차피 덩어리가 끊긴다.
export const quotesAnotherMessage = ({
  inReplyToId,
  rootStatusId,
  previousStatusId,
}: {
  inReplyToId: string | null | undefined;
  rootStatusId: string | null | undefined;
  previousStatusId: string | undefined;
}) =>
  Boolean(inReplyToId) &&
  inReplyToId !== rootStatusId &&
  inReplyToId !== previousStatusId;

// 방마다 전송을 한 줄로 세운다.
//
// 연달아 보내면 두 번째 메시지를 누르는 순간 첫 번째는 아직 서버 id 가 없다. 그대로
// 보내면 둘 다 같은 글에 답글로 달려 일반 클라이언트에서 그 자리가 갈라진다. 앞의
// 전송이 끝난 뒤에 보내고, 앞의 것이 성공했으면 그 글에 단다. 덤으로 서버에 들어가는
// 순서도 누른 순서와 같아진다.
//
// 앞의 전송이 실패해도 뒤의 것은 보낸다(그 글 대신 원래 대상에 단다).
export const createSendQueue = () => {
  const tails = new Map<string, Promise<string | undefined>>();

  return <T extends { id: string }>(
    roomId: string,
    run: (previousSentId: string | undefined) => Promise<T>,
  ): Promise<T> => {
    const previous = tails.get(roomId) ?? Promise.resolve(undefined);
    const result = previous.then((previousSentId) => run(previousSentId));

    const tail = result.then(
      (status) => status.id,
      () => previous,
    );

    tails.set(roomId, tail);

    // 다 끝난 줄은 비운다. 방을 오래 열어 두어도 약속 사슬이 쌓이지 않는다.
    void tail.then(() => {
      if (tails.get(roomId) === tail) tails.delete(roomId);
    });

    return result;
  };
};
