import { List as ImmutableList } from 'immutable';

import type { ThreadHeadState } from '../../reducers/thread_heads';
import { dedupeThreadHeads } from '../thread_preview_dedupe';

// A1-A3-A4, A2-B1-A5-B2, A2-C1-A7-C2. 사용자는 A 만 팔로우 — B1·C1 등은 스토어에 없을 수도 있다.
const parents: Record<string, string> = {
  A3: 'A1',
  A4: 'A3',
  B1: 'A2',
  A5: 'B1',
  B2: 'A5',
  C1: 'A2',
  A7: 'C1',
  C2: 'A7',
};

const reblogs: Record<string, string> = { boostA1: 'A1', boostA4: 'A4' };

const loadedHeads: Record<string, ThreadHeadState> = {
  A3: { headId: 'A1', omitted: 0 },
  A4: { headId: 'A1', omitted: 1 },
  B1: { headId: 'A2', omitted: 0 },
  A5: { headId: 'A2', omitted: 1 },
  B2: { headId: 'A2', omitted: 2 },
  C1: { headId: 'A2', omitted: 0 },
  A7: { headId: 'A2', omitted: 1 },
  C2: { headId: 'A2', omitted: 2 },
};

const run = (
  ids: (string | null)[],
  heads: Record<string, ThreadHeadState> = loadedHeads,
  {
    hidden = [],
    inStore = Object.keys(parents),
  }: { hidden?: string[]; inStore?: string[] } = {},
) =>
  dedupeThreadHeads(ImmutableList(ids), heads, {
    reblogOf: (id) => reblogs[id] ?? null,
    inReplyTo: (id) => (inStore.includes(id) ? parents[id] : undefined),
    isHidden: (id) => hidden.includes(id),
  }).toArray();

describe('dedupeThreadHeads', () => {
  it('shows each branch of a thread once, by its newest post', () => {
    expect(
      run(['C2', 'B2', 'A7', 'A5', 'C1', 'B1', 'A4', 'A3', 'A2', 'A1']),
    ).toEqual(['C2', 'B2', 'A4']);
  });

  it('drops ancestors even when a gap in the chain is not in the store', () => {
    // 타임라인에 B1 이 없다 — 사슬은 A5 에서 끊기지만 시작 글 A2 는 안다.
    expect(
      run(['B2', 'A5', 'A2'], loadedHeads, {
        inStore: ['B2', 'A5', 'A3', 'A4'],
      }),
    ).toEqual(['B2']);
  });

  it('keeps everything while previews are pending or missing', () => {
    expect(run(['A4', 'A3', 'A1'], { A4: 'pending', A3: 'none' })).toEqual([
      'A4',
      'A3',
      'A1',
    ]);
  });

  it('keeps posts that sit above the reply', () => {
    expect(run(['A1', 'A4'])).toEqual(['A1', 'A4']);
  });

  it('keeps boosts of an ancestor', () => {
    expect(run(['A4', 'boostA1'])).toEqual(['A4', 'boostA1']);
  });

  it('uses the chain of a boosted reply', () => {
    expect(run(['boostA4', 'A3', 'A1'])).toEqual(['boostA4']);
  });

  it('lets the next visible reply take over when the newest is filtered', () => {
    // A4 는 필터로 안 그려지므로 A3 이 갈래의 끝이 된다.
    expect(run(['A4', 'A3', 'A1'], loadedHeads, { hidden: ['A4'] })).toEqual([
      'A4',
      'A3',
    ]);
  });

  it('survives a reply cycle', () => {
    const result = dedupeThreadHeads(
      ImmutableList(['x', 'y']),
      { x: { headId: 'z', omitted: 0 } },
      {
        reblogOf: () => null,
        inReplyTo: (id) => (id === 'x' ? 'y' : 'x'),
        isHidden: () => false,
      },
    );
    expect(result.toArray()).toEqual(['x']);
  });

  it('leaves gaps alone and returns the same list when nothing changes', () => {
    const ids = ImmutableList(['a', null, 'b']);
    const result = dedupeThreadHeads(
      ids,
      {},
      { reblogOf: () => null, inReplyTo: () => null, isHidden: () => false },
    );
    expect(result).toBe(ids);
  });
});
