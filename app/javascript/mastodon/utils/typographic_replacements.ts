export interface TypographicReplacement {
  start: number;
  original: string;
  replaced: string;
}

export interface TypographicEdit {
  value: string;
  caret: number;
  replacement: TypographicReplacement | null;
}

const EM_DASH = '—';

const RULES: readonly (readonly [string, string])[] = [
  ['--', EM_DASH],
  ['->', '→'],
  ['<-', '←'],
  ['...', '…'],
  ['<<', '《'],
  ['>>', '》'],
];

const TRIGGERS = new Set(RULES.map(([from]) => from.slice(-1)));

const typedCharacter = (
  previous: string,
  next: string,
  caret: number,
): string | null => {
  if (caret < 1 || next.length !== previous.length + 1) return null;
  if (next.slice(0, caret - 1) + next.slice(caret) !== previous) return null;

  return next.charAt(caret - 1);
};

const isInsideUrl = (value: string, caret: number): boolean => {
  const word = /\S*$/.exec(value.slice(0, caret))?.[0] ?? '';

  return word.includes('://') || word.startsWith('www.');
};

const splice = (
  value: string,
  start: number,
  end: number,
  text: string,
): string => value.slice(0, start) + text + value.slice(end);

const extendEmDash = (
  value: string,
  caret: number,
  last: TypographicReplacement | null,
): TypographicEdit | null => {
  if (last?.original !== '--' || last.start !== caret - 2) return null;
  if (value.charAt(last.start) !== EM_DASH) return null;

  return {
    value: splice(value, caret - 1, caret, ''),
    caret: caret - 1,
    replacement: { start: last.start, original: '---', replaced: EM_DASH },
  };
};

export const replaceTypedSequence = (
  previous: string,
  next: string,
  caret: number,
  last: TypographicReplacement | null,
): TypographicEdit | null => {
  const character = typedCharacter(previous, next, caret);

  if (character === null || !TRIGGERS.has(character)) return null;
  if (isInsideUrl(next, caret)) return null;

  if (character === '-') {
    const extended = extendEmDash(next, caret, last);
    if (extended) return extended;
  }

  const rule = RULES.find(
    ([from]) => next.slice(caret - from.length, caret) === from,
  );
  if (!rule) return null;

  const [original, replaced] = rule;
  const start = caret - original.length;

  return {
    value: splice(next, start, caret, replaced),
    caret: start + replaced.length,
    replacement: { start, original, replaced },
  };
};

export const undoTypographicReplacement = (
  value: string,
  selectionStart: number,
  selectionEnd: number,
  last: TypographicReplacement | null,
): TypographicEdit | null => {
  if (!last || selectionStart !== selectionEnd) return null;

  const end = last.start + last.replaced.length;
  if (
    selectionStart !== end ||
    value.slice(last.start, end) !== last.replaced
  ) {
    return null;
  }

  return {
    value: splice(value, last.start, end, last.original),
    caret: last.start + last.original.length,
    replacement: null,
  };
};

export const applyEditToTextarea = (
  node: HTMLTextAreaElement,
  edit: TypographicEdit,
): void => {
  node.value = edit.value;
  node.setSelectionRange(edit.caret, edit.caret);
};
