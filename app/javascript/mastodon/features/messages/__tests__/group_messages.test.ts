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

  it('shows a timestamp only when the next group is far away', () => {
    const sections = groupMessages([
      message('1', 'a', '2026-08-10T10:00:00Z'),
      message('2', 'b', '2026-08-10T10:00:30Z'),
      message('3', 'a', '2026-08-10T11:00:00Z'),
    ]);

    const groups = sections[0]?.groups ?? [];

    expect(groups[0]?.messages[0]?.showTimestamp).toBe(false);
    expect(groups[1]?.messages[0]?.showTimestamp).toBe(true);
    expect(groups[2]?.messages[0]?.showTimestamp).toBe(true);
  });

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
});
