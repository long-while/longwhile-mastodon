import type { List as ImmutableList } from 'immutable';

import type { ThreadHeadState } from 'mastodon/reducers/thread_heads';

export interface StatusLookup {
  reblogOf: (id: string) => string | null | undefined;
  inReplyTo: (id: string) => string | null | undefined;
  isHidden: (id: string) => boolean;
}

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
