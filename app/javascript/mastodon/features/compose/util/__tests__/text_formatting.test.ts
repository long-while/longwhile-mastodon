import { describe, expect, it } from 'vitest';

import {
  applyTextColor,
  clearFormatting,
  getActiveMarks,
  toggleMark,
} from '../text_formatting';
import { changedRange } from '../textarea_selection';

const parse = (marked: string) => {
  const start = marked.indexOf('«');
  const end = marked.indexOf('»') - 1;
  return { text: marked.replace('«', '').replace('»', ''), start, end };
};

const show = ({
  text,
  start,
  end,
}: {
  text: string;
  start: number;
  end: number;
}) => `${text.slice(0, start)}«${text.slice(start, end)}»${text.slice(end)}`;

const mark = (marked: string, which: Parameters<typeof toggleMark>[3]) => {
  const { text, start, end } = parse(marked);
  return show(toggleMark(text, start, end, which));
};

const color = (marked: string, hex: string | null) => {
  const { text, start, end } = parse(marked);
  return show(applyTextColor(text, start, end, hex));
};

const clear = (marked: string) => {
  const { text, start, end } = parse(marked);
  return show(clearFormatting(text, start, end));
};

const active = (marked: string) => {
  const { text, start, end } = parse(marked);
  return getActiveMarks(text, start, end);
};

describe('toggleMark', () => {
  it('wraps a selection and keeps the letters selected', () => {
    expect(mark('안녕 «하세요»', 'bold')).toBe('안녕 **«하세요»**');
    expect(mark('«a»', 'italic')).toBe('*«a»*');
    expect(mark('«a»', 'underline')).toBe('[u]«a»[/u]');
    expect(mark('«a»', 'strike')).toBe('[s]«a»[/s]');
  });

  it('turns a mark off when pressed again', () => {
    expect(mark('**«a»**', 'bold')).toBe('«a»');
    expect(mark('[u]«a»[/u]', 'underline')).toBe('«a»');
  });

  it('understands a selection that includes the markers', () => {
    expect(mark('«**a**»', 'bold')).toBe('«a»');
    expect(mark('«[s]a[/s]»', 'strike')).toBe('«a»');
  });

  it('combines bold and italic into three stars', () => {
    expect(mark('**«a»**', 'italic')).toBe('***«a»***');
    expect(mark('*«a»*', 'bold')).toBe('***«a»***');
    expect(mark('***«a»***', 'bold')).toBe('*«a»*');
    expect(mark('***«a»***', 'italic')).toBe('**«a»**');
  });

  it('finds stars through bracket tags', () => {
    expect(mark('[u]**«a»**[/u]', 'bold')).toBe('[u]«a»[/u]');
    expect(mark('**[color:cf5148]«a»[/color]**', 'bold')).toBe(
      '[color:cf5148]«a»[/color]',
    );
  });

  it('removes a typed ~~~ strike', () => {
    expect(mark('~~~«a»~~~', 'strike')).toBe('«a»');
  });

  it('leaves surrounding spaces outside the markers', () => {
    expect(mark('«  a b  »', 'bold')).toBe('  **«a b»**  ');
  });

  it('wraps each line on its own', () => {
    expect(mark('«a\n\nb»', 'bold')).toBe('**«a**\n\n**b»**');
  });

  it('turns on for every line when only some have it', () => {
    expect(mark('«**a**\nb»', 'bold')).toBe('**«a**\n**b»**');
    expect(mark('«**a**\n**b**»', 'bold')).toBe('«a\nb»');
  });

  it('does nothing for a selection of spaces', () => {
    expect(mark('a«  »b', 'bold')).toBe('a«  »b');
  });

  it('does not pair markers from two separate words', () => {
    expect(mark('«[u]a[/u] b [u]c[/u]»', 'underline')).toBe(
      '[u]«[u]a[/u] b [u]c[/u]»[/u]',
    );
  });
});

describe('applyTextColor', () => {
  it('wraps with a color tag', () => {
    expect(color('«a»', 'cf5148')).toBe('[color:cf5148]«a»[/color]');
  });

  it('replaces an existing color instead of nesting', () => {
    expect(color('[color:cf5148]«a»[/color]', '387dc9')).toBe(
      '[color:387dc9]«a»[/color]',
    );
    expect(color('[color:f00]**«a»**[/color]', '387dc9')).toBe(
      '[color:387dc9]**«a»**[/color]',
    );
  });

  it('removes the color for default text', () => {
    expect(color('[color:cf5148]«a»[/color]', null)).toBe('«a»');
    expect(color('«a»', null)).toBe('«a»');
  });
});

describe('clearFormatting', () => {
  it('removes the markers around and inside the selection', () => {
    expect(clear('[color:cf5148][u]**«a»**[/u][/color]')).toBe('«a»');
    expect(clear('«**a** [s]b[/s] *c*»')).toBe('«a b c»');
  });

  it('keeps alignment and lone asterisks', () => {
    expect(clear('[center]«**a**»[/center]')).toBe('[center]«a»[/center]');
    expect(clear('«2 * 3»')).toBe('«2 * 3»');
  });
});

describe('getActiveMarks', () => {
  it('reports the marks around the selection', () => {
    expect(active('[color:cf5148]***«a»***[/color]')).toEqual({
      bold: true,
      italic: true,
      underline: false,
      strike: false,
      color: 'cf5148',
    });
  });

  it('reports a mark only when every line has it', () => {
    expect(active('«**a**\nb»').bold).toBe(false);
  });
});

describe('changedRange', () => {
  it('finds the changed middle', () => {
    expect(changedRange('abc', 'a**b**c')).toEqual({ prefix: 1, suffix: 1 });
    expect(changedRange('x**a**y', 'xay')).toEqual({ prefix: 1, suffix: 1 });
    expect(changedRange('aa', 'aaa')).toEqual({ prefix: 2, suffix: 0 });
  });
});
