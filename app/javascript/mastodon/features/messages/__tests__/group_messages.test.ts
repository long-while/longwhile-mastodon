import type { GroupableMessage } from '../util/group_messages';
import { groupMessages } from '../util/group_messages';

const at = (iso: string) => new Date(iso).toISOString();

const message = (
  id: string,
  accountId: string,
  iso: string,
  quotes = false,
): GroupableMessage => ({
  id,
  accountId,
  createdAt: at(iso),
  quotesAnotherMessage: quotes,
});

describe('groupMessages', () => {
  it('returns nothing for an empty list', () => {
    expect(groupMessages([])).toEqual([]);
  });

  it('groups consecutive messages from the same author within three minutes', () => {
    const sections = groupMessages([
      message('1', 'a', '2026-08-10T10:00:00Z'),
      message('2', 'a', '2026-08-10T10:01:00Z'),
    ]);

    expect(sections).toHaveLength(1);
    expect(sections[0]?.groups).toHaveLength(1);
    expect(sections[0]?.groups[0]?.messages).toHaveLength(2);
  });

  it('splits when more than three minutes pass', () => {
    const sections = groupMessages([
      message('1', 'a', '2026-08-10T10:00:00Z'),
      message('2', 'a', '2026-08-10T10:04:00Z'),
    ]);

    expect(sections[0]?.groups).toHaveLength(2);
  });

  it('splits when the author changes', () => {
    const sections = groupMessages([
      message('1', 'a', '2026-08-10T10:00:00Z'),
      message('2', 'b', '2026-08-10T10:00:30Z'),
    ]);

    expect(sections[0]?.groups).toHaveLength(2);
  });

  // 인용 상자가 붙는 메시지는 시각적으로 독립해야 읽힌다.
  it('splits a message that quotes another one', () => {
    const sections = groupMessages([
      message('1', 'a', '2026-08-10T10:00:00Z'),
      message('2', 'a', '2026-08-10T10:00:30Z', true),
    ]);

    expect(sections[0]?.groups).toHaveLength(2);
  });

  it('marks the first and last message of a group', () => {
    const sections = groupMessages([
      message('1', 'a', '2026-08-10T10:00:00Z'),
      message('2', 'a', '2026-08-10T10:01:00Z'),
      message('3', 'a', '2026-08-10T10:02:00Z'),
    ]);

    const entries = sections[0]?.groups[0]?.messages ?? [];

    expect(entries.map((entry) => entry.isFirstInGroup)).toEqual([
      true,
      false,
      false,
    ]);
    expect(entries.map((entry) => entry.isLastInGroup)).toEqual([
      false,
      false,
      true,
    ]);
  });

  it('starts a new section when the local day changes', () => {
    const sections = groupMessages([
      message('1', 'a', '2026-08-10T01:00:00Z'),
      message('2', 'a', '2026-08-12T01:00:00Z'),
    ]);

    expect(sections).toHaveLength(2);
  });

  // 시각은 말풍선 바깥에 세로로 서므로 세로 높이를 만들지 않는다. 30초 뒤에 바로
  // 이어지는 덩어리라도 감추지 않는다.
  it('shows a timestamp on the last message of every group', () => {
    const sections = groupMessages([
      message('1', 'a', '2026-08-10T10:00:00Z'),
      message('2', 'b', '2026-08-10T10:00:30Z'),
      message('3', 'a', '2026-08-10T11:00:00Z'),
    ]);

    const groups = sections[0]?.groups ?? [];

    expect(groups[0]?.messages[0]?.showTimestamp).toBe(true);
    expect(groups[1]?.messages[0]?.showTimestamp).toBe(true);
    expect(groups[2]?.messages[0]?.showTimestamp).toBe(true);
  });

  // 덩어리 **안**에서는 마지막에만 붙는다. 세 개가 묶이면 앞의 둘은 감춘다.
  it('shows a timestamp only on the last message within a group', () => {
    const sections = groupMessages([
      message('1', 'a', '2026-08-10T10:00:00Z'),
      message('2', 'a', '2026-08-10T10:00:30Z'),
      message('3', 'a', '2026-08-10T10:01:00Z'),
    ]);

    const entries = sections[0]?.groups[0]?.messages ?? [];

    expect(entries.map((entry) => entry.showTimestamp)).toEqual([
      false,
      false,
      true,
    ]);
  });

  // 덩어리가 나뉜 이유를 가른다. 여백이 달라지기 때문이다.
  it('marks whether a group started because the sender changed', () => {
    const sections = groupMessages([
      message('1', 'a', '2026-08-10T10:00:00Z'),
      // 상대가 답했다 → 발신자 전환
      message('2', 'b', '2026-08-10T10:00:30Z'),
      // 같은 사람이 한참 뒤에 다시 → 시간차로 나뉜 덩어리
      message('3', 'b', '2026-08-10T11:00:00Z'),
    ]);

    const groups = sections[0]?.groups ?? [];

    // 맨 앞 덩어리는 앞이 없으므로 false 다.
    expect(groups[0]?.messages[0]?.isSenderChanged).toBe(false);
    expect(groups[1]?.messages[0]?.isSenderChanged).toBe(true);
    expect(groups[2]?.messages[0]?.isSenderChanged).toBe(false);
  });

  // 날짜가 바뀌어도 앞 덩어리와 비교한다. 자정을 넘겨 같은 사람이 이어 말한 것과
  // 상대가 답한 것은 화면에서 달라야 한다.
  it('compares across date sections', () => {
    const sections = groupMessages([
      message('1', 'a', '2026-08-10T14:00:00Z'),
      message('2', 'b', '2026-08-12T14:00:00Z'),
    ]);

    expect(sections).toHaveLength(2);
    expect(sections[1]?.groups[0]?.messages[0]?.isSenderChanged).toBe(true);
  });

  // 과거 페이지를 앞에 붙이면 기존 첫 메시지의 묶임 상태가 바뀌어야 한다. 그것이
  // 전체를 다시 계산하는 이유다. (검토 S-9)
  it('regroups the whole list when older messages are prepended', () => {
    const later = [
      message('2', 'a', '2026-08-10T10:01:00Z'),
      message('3', 'a', '2026-08-10T10:02:00Z'),
    ];

    const before = groupMessages(later);
    expect(before[0]?.groups[0]?.messages[0]?.isFirstInGroup).toBe(true);

    const after = groupMessages([
      message('1', 'a', '2026-08-10T10:00:00Z'),
      ...later,
    ]);

    const entries = after[0]?.groups[0]?.messages ?? [];
    expect(entries).toHaveLength(3);
    expect(entries[1]?.isFirstInGroup).toBe(false);
  });

  // 방 제목 변경 안내(Phase 5)는 덩어리에 섞이지 않는다. 가운데 정렬 문장이
  // 덩어리 한가운데 끼면 위아래 말풍선이 한 덩어리인 채로 갈라진다.
  describe('standalone messages', () => {
    const standalone = (
      id: string,
      accountId: string,
      iso: string,
    ): GroupableMessage => ({
      ...message(id, accountId, iso),
      standalone: true,
    });

    it('does not join the group before it', () => {
      const sections = groupMessages([
        message('1', 'a', '2026-08-10T10:00:00Z'),
        standalone('2', 'a', '2026-08-10T10:00:30Z'),
      ]);

      expect(sections[0]?.groups).toHaveLength(2);
    });

    // quotesAnotherMessage 와 다른 점이 여기다 — 인용은 자기만 떨어져 나오면
    // 되지만, 안내는 **뒤쪽까지** 끊어야 한다.
    it('does not let the next message join it', () => {
      const sections = groupMessages([
        standalone('1', 'a', '2026-08-10T10:00:00Z'),
        message('2', 'a', '2026-08-10T10:00:30Z'),
      ]);

      expect(sections[0]?.groups).toHaveLength(2);
    });

    it('splits a run of same-author messages into three groups', () => {
      const sections = groupMessages([
        message('1', 'a', '2026-08-10T10:00:00Z'),
        standalone('2', 'a', '2026-08-10T10:00:30Z'),
        message('3', 'a', '2026-08-10T10:01:00Z'),
      ]);

      expect(sections[0]?.groups).toHaveLength(3);
    });
  });
});
