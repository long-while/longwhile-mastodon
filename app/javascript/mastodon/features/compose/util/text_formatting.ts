export type InlineMark = 'bold' | 'italic' | 'underline' | 'strike';

export interface TextSelectionEdit {
  text: string;
  start: number;
  end: number;
}

type Wrapper =
  | { kind: 'stars'; count: number }
  | { kind: 'u' | 's' | 'tilde' }
  | { kind: 'color' | 'bg'; hex: string };

interface Segment {
  from: number;
  to: number;
  core: string;
  wrappers: Wrapper[];
}

const HEX = '(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})';
const OPENER_AT_END = new RegExp(`(\\[[us]\\]|\\[(?:color|bg):${HEX}\\]|~~~)$`);
const OPENER_AT_START = new RegExp(
  `^(\\[[us]\\]|\\[(?:color|bg):${HEX}\\]|~~~)`,
);
const CLOSER_AT_START = /^(\[\/(?:u|s|color|bg)\]|~~~)/;
const CLOSER_AT_END = /(\[\/(?:u|s|color|bg)\]|~~~)$/;

const tokenToWrapper = (opener: string, closer: string): Wrapper | null => {
  if (opener === '~~~') return closer === '~~~' ? { kind: 'tilde' } : null;

  const tag = /^\[(u|s|color|bg)(?::(\w+))?\]$/.exec(opener);
  if (!tag || closer !== `[/${tag[1]}]`) return null;

  if (tag[1] === 'color' || tag[1] === 'bg') {
    return { kind: tag[1], hex: tag[2] ?? '' };
  }

  return { kind: tag[1] as 'u' | 's' };
};

const openTag = (wrapper: Wrapper): string => {
  switch (wrapper.kind) {
    case 'stars':
      return '*'.repeat(wrapper.count);
    case 'tilde':
      return '~~~';
    case 'color':
    case 'bg':
      return `[${wrapper.kind}:${wrapper.hex}]`;
    default:
      return `[${wrapper.kind}]`;
  }
};

const closeTag = (wrapper: Wrapper): string => {
  switch (wrapper.kind) {
    case 'stars':
      return '*'.repeat(wrapper.count);
    case 'tilde':
      return '~~~';
    default:
      return `[/${wrapper.kind}]`;
  }
};

const leadingStars = (value: string) => /^\**/.exec(value)?.[0].length ?? 0;
const trailingStars = (value: string) => /\**$/.exec(value)?.[0].length ?? 0;

const peelOutward = (text: string, from: number, to: number) => {
  const before = text.slice(0, from);
  const after = text.slice(to);
  const starsBefore = trailingStars(before);

  if (starsBefore > 0) {
    const count = starsBefore;
    if (count > 3 || leadingStars(after) !== count) return null;

    return {
      wrapper: { kind: 'stars', count } as Wrapper,
      open: count,
      close: count,
    };
  }

  const opener = OPENER_AT_END.exec(before)?.[1];
  const closer = CLOSER_AT_START.exec(after)?.[1];
  if (!opener || !closer) return null;

  const wrapper = tokenToWrapper(opener, closer);
  return wrapper && { wrapper, open: opener.length, close: closer.length };
};

const peelInward = (core: string) => {
  const stars = Math.min(leadingStars(core), trailingStars(core));

  if (stars > 0 && stars <= 3 && core.length > stars * 2) {
    const inner = core.slice(stars, -stars);
    if (inner.includes('*') || /^\s|\s$/.test(inner)) return null;
    return { wrapper: { kind: 'stars', count: stars } as Wrapper, inner };
  }

  const opener = OPENER_AT_START.exec(core)?.[1];
  const closer = CLOSER_AT_END.exec(core)?.[1];
  if (!opener || !closer || core.length <= opener.length + closer.length) {
    return null;
  }

  const wrapper = tokenToWrapper(opener, closer);
  const inner = core.slice(opener.length, -closer.length);
  if (!wrapper || inner.includes(closer)) return null;

  return { wrapper, inner };
};

const readSegment = (text: string, start: number, end: number): Segment => {
  let core = text.slice(start, end);
  let from = start;
  let to = end;
  const inside: Wrapper[] = [];

  for (let peeled = peelInward(core); peeled; peeled = peelInward(core)) {
    inside.unshift(peeled.wrapper);
    core = peeled.inner;
  }

  const outside: Wrapper[] = [];

  for (
    let peeled = peelOutward(text, from, to);
    peeled;
    peeled = peelOutward(text, from, to)
  ) {
    outside.push(peeled.wrapper);
    from -= peeled.open;
    to += peeled.close;
  }

  return { from, to, core, wrappers: [...inside, ...outside] };
};

const selectionLines = (text: string, start: number, end: number) => {
  const lines: { start: number; end: number }[] = [];
  let lineStart = start;

  while (lineStart <= end) {
    const newline = text.indexOf('\n', lineStart);
    const lineEnd = newline === -1 || newline > end ? end : newline;
    let s = lineStart;
    let e = lineEnd;

    while (s < e && /\s/.test(text.charAt(s))) s++;
    while (e > s && /\s/.test(text.charAt(e - 1))) e--;
    if (e > s) lines.push({ start: s, end: e });

    if (lineEnd === end) break;
    lineStart = lineEnd + 1;
  }

  return lines;
};

const readSegments = (text: string, start: number, end: number) =>
  selectionLines(text, start, end).map((line) =>
    readSegment(text, line.start, line.end),
  );

const hasMark = (wrappers: Wrapper[], mark: InlineMark): boolean =>
  wrappers.some((wrapper) => {
    switch (mark) {
      case 'bold':
        return wrapper.kind === 'stars' && wrapper.count >= 2;
      case 'italic':
        return wrapper.kind === 'stars' && wrapper.count !== 2;
      case 'underline':
        return wrapper.kind === 'u';
      default:
        return wrapper.kind === 's' || wrapper.kind === 'tilde';
    }
  });

const starDelta = (mark: 'bold' | 'italic') => (mark === 'bold' ? 2 : 1);

const setStars = (
  wrappers: Wrapper[],
  mark: 'bold' | 'italic',
  on: boolean,
) => {
  const index = wrappers.findIndex((wrapper) => wrapper.kind === 'stars');
  const current =
    index === -1 ? 0 : (wrappers[index] as { count: number }).count;
  const count = current + (on ? starDelta(mark) : -starDelta(mark));
  const rest = wrappers.filter((_, i) => i !== index);

  return count > 0 ? [{ kind: 'stars', count } as Wrapper, ...rest] : rest;
};

const setMark = (
  wrappers: Wrapper[],
  mark: InlineMark,
  on: boolean,
): Wrapper[] => {
  if (hasMark(wrappers, mark) === on) return wrappers;
  if (mark === 'bold' || mark === 'italic') return setStars(wrappers, mark, on);

  const kind = mark === 'underline' ? 'u' : 's';
  if (on) return [{ kind }, ...wrappers];

  return wrappers.filter((wrapper) =>
    kind === 'u'
      ? wrapper.kind !== 'u'
      : wrapper.kind !== 's' && wrapper.kind !== 'tilde',
  );
};

const setColor = (wrappers: Wrapper[], hex: string | null): Wrapper[] => {
  const rest = wrappers.filter((wrapper) => wrapper.kind !== 'color');
  if (!hex) return rest;

  const index = wrappers.findIndex((wrapper) => wrapper.kind === 'color');
  if (index === -1) return [...rest, { kind: 'color', hex }];

  return wrappers.map((wrapper, i) =>
    i === index ? { kind: 'color', hex } : wrapper,
  );
};

const INNER_FORMATTING: [RegExp, string][] = [
  [/(?<!\*)\*\*\*(?=\S)([^*\n]+?)(?<=\S)\*\*\*(?!\*)/g, '$1'],
  [/(?<!\*)\*\*(?=\S)([^*\n]+?)(?<=\S)\*\*(?!\*)/g, '$1'],
  [/(?<!\*)\*(?=\S)([^*\n]+?)(?<=\S)\*(?!\*)/g, '$1'],
  [/~~~(?=\S)([^~\n]+?)(?<=\S)~~~/g, '$1'],
  [
    new RegExp(`\\[(u|s|color|bg)(?::${HEX})?\\]([^\\n]*?)\\[\\/\\1\\]`, 'g'),
    '$2',
  ],
];

const stripFormatting = (core: string): string => {
  let previous;
  let result = core;

  do {
    previous = result;
    result = INNER_FORMATTING.reduce(
      (acc, [pattern, to]) => acc.replace(pattern, to),
      result,
    );
  } while (result !== previous);

  return result;
};

const applyToSegments = (
  text: string,
  segments: Segment[],
  change: (segment: Segment) => Segment,
): TextSelectionEdit => {
  let output = '';
  let cursor = 0;
  let start = -1;
  let end = -1;

  for (const segment of segments) {
    const next = change(segment);
    const opens = [...next.wrappers].reverse().map(openTag).join('');
    const closes = next.wrappers.map(closeTag).join('');

    output += text.slice(cursor, segment.from);
    if (start === -1) start = output.length + opens.length;
    end = output.length + opens.length + next.core.length;
    output += opens + next.core + closes;
    cursor = segment.to;
  }

  return { text: output + text.slice(cursor), start, end };
};

const unchanged = (text: string, start: number, end: number) => ({
  text,
  start,
  end,
});

export const getActiveMarks = (text: string, start: number, end: number) => {
  const segments = readSegments(text, start, end);
  const all = (test: (wrappers: Wrapper[]) => boolean) =>
    segments.length > 0 && segments.every((segment) => test(segment.wrappers));
  const colors = new Set(
    segments.map((segment) => {
      const color = segment.wrappers.find(
        (wrapper) => wrapper.kind === 'color',
      );
      return color && 'hex' in color ? color.hex.toLowerCase() : null;
    }),
  );

  return {
    bold: all((w) => hasMark(w, 'bold')),
    italic: all((w) => hasMark(w, 'italic')),
    underline: all((w) => hasMark(w, 'underline')),
    strike: all((w) => hasMark(w, 'strike')),
    color: colors.size === 1 ? ([...colors][0] ?? null) : null,
  };
};

export type ActiveMarks = ReturnType<typeof getActiveMarks>;

export const toggleMark = (
  text: string,
  start: number,
  end: number,
  mark: InlineMark,
): TextSelectionEdit => {
  const segments = readSegments(text, start, end);
  if (segments.length === 0) return unchanged(text, start, end);

  const on = !segments.every((segment) => hasMark(segment.wrappers, mark));

  return applyToSegments(text, segments, (segment) => ({
    ...segment,
    wrappers: setMark(segment.wrappers, mark, on),
  }));
};

export const applyTextColor = (
  text: string,
  start: number,
  end: number,
  hex: string | null,
): TextSelectionEdit => {
  const segments = readSegments(text, start, end);
  if (segments.length === 0) return unchanged(text, start, end);

  return applyToSegments(text, segments, (segment) => ({
    ...segment,
    wrappers: setColor(segment.wrappers, hex),
  }));
};

export const clearFormatting = (
  text: string,
  start: number,
  end: number,
): TextSelectionEdit => {
  const segments = readSegments(text, start, end);
  if (segments.length === 0) return unchanged(text, start, end);

  return applyToSegments(text, segments, (segment) => ({
    ...segment,
    core: stripFormatting(segment.core),
    wrappers: [],
  }));
};
