import type { TypographicReplacement } from '../typographic_replacements';
import {
  replaceTypedSequence,
  undoTypographicReplacement,
} from '../typographic_replacements';

const typeText = (text: string, initial = '') => {
  let value = initial;
  let last: TypographicReplacement | null = null;

  for (const character of text) {
    const next = value + character;
    const edit = replaceTypedSequence(value, next, next.length, last);

    value = edit ? edit.value : next;
    last = edit?.replacement ?? null;
  }

  return { value, last };
};

describe('replaceTypedSequence', () => {
  it.each([
    ['a--b', 'a—b'],
    ['a---b', 'a—b'],
    ['a -> b', 'a → b'],
    ['a <- b', 'a ← b'],
    ['wait...', 'wait…'],
    ['<<책>>', '《책》'],
    ['<-->', '←→'],
  ])('turns %j into %j', (typed, expected) => {
    expect(typeText(typed).value).toBe(expected);
  });

  it('keeps a long run of hyphens as a line of dashes', () => {
    expect(typeText('----------').value).toBe('———-');
  });

  it('does not swallow a hyphen after an em dash that was already there', () => {
    expect(typeText('-', '—').value).toBe('—-');
  });

  it('leaves URLs alone', () => {
    expect(typeText('https://a.com/x--y...').value).toBe(
      'https://a.com/x--y...',
    );
    expect(typeText('see www.a--b.com').value).toBe('see www.a--b.com');
  });

  it('replaces in the middle of the text at the caret', () => {
    const edit = replaceTypedSequence('a-z', 'a->z', 3, null);

    expect(edit).toMatchObject({ value: 'a→z', caret: 2 });
  });

  it('ignores pastes and deletions', () => {
    expect(replaceTypedSequence('', 'a--', 3, null)).toBeNull();
    expect(replaceTypedSequence('a---', 'a--', 3, null)).toBeNull();
  });
});

describe('undoTypographicReplacement', () => {
  it('restores what was typed when Backspace follows the replacement', () => {
    const { value, last } = typeText('a->');
    const edit = undoTypographicReplacement(
      value,
      value.length,
      value.length,
      last,
    );

    expect(edit).toMatchObject({ value: 'a->', caret: 3 });
  });

  it('restores all three hyphens of ---', () => {
    const { value, last } = typeText('---');

    expect(undoTypographicReplacement(value, 1, 1, last)?.value).toBe('---');
  });

  it('does nothing once the caret has moved away', () => {
    const { value, last } = typeText('a...');

    expect(undoTypographicReplacement(value, 0, 0, last)).toBeNull();
    expect(undoTypographicReplacement(value, 0, 2, last)).toBeNull();
  });
});
