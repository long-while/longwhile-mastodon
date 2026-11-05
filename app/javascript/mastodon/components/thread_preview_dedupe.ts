import type { List as ImmutableList } from 'immutable';

import type { ThreadHeadState } from 'mastodon/reducers/thread_heads';

// @_longwhile — 홈·퍼블릭에서 타래 한 갈래는 **한 번만**, 가장 최근 글(갈래의 끝)로 보인다.
//
//   A1-A3-A4, A2-B1-A5-B2, A2-C1-A7-C2 가 있으면 타임라인에는
//   A2-B2 / A2-C2 / A1-A4 셋만 남는다. A3·A1 은 A4 의 조상이라, B1·A5 는 B2 의 조상이라 빠진다.
//   A2 는 두 갈래가 모두 시작 글로 그린다 — 갈래가 다르면 따로 보인다.
//
//   * **위쪽 답글이 미리보기를 받은 뒤에만** 그 조상을 뺀다. 묻는 중이거나 실패하면 답글이
//     "~님에게" 줄만 그리므로, 그때 조상을 빼면 맥락이 통째로 사라진다.
//   * 조상은 시작 글과, 스토어에 있는 `in_reply_to_id` 사슬이다. 사슬은 스토어에 없는 글에서
//     끊긴다 — 타임라인에 없는 글이라 뺄 것도 없다.
//   * 목록은 최신순이라 조상은 답글보다 아래에 있다. 위에서부터 훑으며 지금까지 본 답글의
//     조상만 빼므로, 답글보다 위에 있는 글은 건드리지 않는다.
//   * 빼는 것은 그 글 **자체**인 항목뿐이다. 누군가의 부스트(감싼 항목)는 남긴다 — 부스트했다는
//     사실은 답글 미리보기로 대신할 수 없다.
//   * 답글이 필터("숨기기")로 그려지지 않으면 그 조상을 빼지 않는다.

export interface StatusLookup {
  reblogOf: (id: string) => string | null | undefined;
  inReplyTo: (id: string) => string | null | undefined;
  isHidden: (id: string) => boolean;
}

// 사슬이 꼬였을 때(순환) 끝없이 돌지 않게.
const MAX_CHAIN = 200;

const collectAncestors = (
  replyId: string,
  headId: string,
  lookup: StatusLookup,
  into: Set<string>,
) => {
  into.add(headId);

  const seen = new Set<string>([replyId]);
  let current = lookup.inReplyTo(replyId);

  while (current && !seen.has(current) && seen.size < MAX_CHAIN) {
    seen.add(current);
    into.add(current);
    if (current === headId) return;
    current = lookup.inReplyTo(current);
  }
};

export const dedupeThreadHeads = (
  statusIds: ImmutableList<string | null>,
  threadHeads: Record<string, ThreadHeadState | undefined>,
  lookup: StatusLookup,
): ImmutableList<string | null> => {
  const shownAncestors = new Set<string>();

  const kept = statusIds.filter((id) => {
    if (id === null) return true;

    const reblogOf = lookup.reblogOf(id);

    if (!reblogOf && shownAncestors.has(id)) {
      return false;
    }

    const targetId = reblogOf ?? id;
    const entry = threadHeads[targetId];

    if (entry && typeof entry === 'object' && !lookup.isHidden(id)) {
      collectAncestors(targetId, entry.headId, lookup, shownAncestors);
    }

    return true;
  });

  return kept.size === statusIds.size ? statusIds : kept;
};
