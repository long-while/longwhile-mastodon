import { IntlMessageFormat } from 'intl-messageformat';

import { describe, expect, it } from 'vitest';

import ko from '../ko.json';

const literalText = (node: unknown): string[] => {
  if (Array.isArray(node)) return node.flatMap(literalText);
  if (typeof node !== 'object' || node === null) return [];

  const element = node as Record<string, unknown>;
  const own =
    element.type === 0 && typeof element.value === 'string'
      ? [element.value]
      : [];
  const children = [element.children, element.options]
    .filter((child) => child !== undefined)
    .flatMap((child) =>
      Array.isArray(child)
        ? literalText(child)
        : Object.values(child as Record<string, { value: unknown }>).flatMap(
            (option) => literalText(option.value),
          ),
    );

  return [...own, ...children];
};

describe('ko.json', () => {
  it('never shows a placeholder as plain text because of a quote', () => {
    const broken = Object.entries(ko as Record<string, string>)
      .filter(([, message]) => {
        const ast = new IntlMessageFormat(message, 'ko').getAst();
        return literalText(ast).some((text) => text.includes('{'));
      })
      .map(([id]) => id);

    expect(broken).toEqual([]);
  });
});
