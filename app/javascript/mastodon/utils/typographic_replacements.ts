// 입력창에서 `--` → `—`, `->` → `→` 처럼 치는 대로 기호를 바꿔 준다.
//
// **한 글자를 쳤을 때만** 바꾼다. 붙여넣기·자동완성·삭제는 여러 글자가 한꺼번에
// 바뀌므로 걸리지 않는다 — 코드나 주소를 붙여넣었는데 `--` 가 `—` 로 망가지면
// 안 된다. 바로 뒤에 Backspace 를 누르면 친 그대로 되돌린다.

export interface TypographicReplacement {
  // 바뀐 기호가 시작하는 위치
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

// 앞에 있는 것이 먼저 걸린다. 모두 마지막 글자를 친 순간에 판정한다.
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

// 주소 안의 `--` 나 `...` 는 바꾸면 링크가 깨진다.
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

// `--` 가 `—` 로 바뀐 직후의 `-` 는 `---` 로 친 것이다. `—` 뒤라고 아무 `-` 나
// 삼키면 `----------` 같은 구분선이 `—` 한 글자로 줄어든다.
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

// 제어 컴포넌트에서 쓴다. DOM 값을 먼저 고쳐 두면 뒤따르는 렌더가 같은 값을
// 받으므로 React 가 값을 다시 쓰지 않고, 그래서 커서가 끝으로 튀지 않는다.
export const applyEditToTextarea = (
  node: HTMLTextAreaElement,
  edit: TypographicEdit,
): void => {
  node.value = edit.value;
  node.setSelectionRange(edit.caret, edit.caret);
};
