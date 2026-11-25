import { afterEach, describe, expect, it } from 'vitest';

import {
  isValidHex,
  sanitizeHex,
  setupTextColorPalette,
} from '../text_color_palette';

const row = (index: string, name: string, hex: string) => `
  <li class="text-color-palette__row">
    <div class="text-color-palette__previews">
      <span class="text-color-palette__preview text-color-palette__preview--dark">A</span>
      <span class="text-color-palette__preview text-color-palette__preview--light">A</span>
    </div>
    <input class="text-color-palette__name" name="form_admin_settings[text_color_palette][${index}][name]" value="${name}">
    <div class="text-color-palette__hex">
      <input class="text-color-palette__code" name="form_admin_settings[text_color_palette][${index}][hex]" value="${hex}" maxlength="6">
    </div>
    <button type="button" class="text-color-palette__action text-color-palette__up">up</button>
    <button type="button" class="text-color-palette__action text-color-palette__down">down</button>
    <button type="button" class="text-color-palette__action text-color-palette__remove">x</button>
  </li>`;

const mount = (rows: string[], max = 3) => {
  document.body.innerHTML = `
    <section class="text-color-palette" data-max="${max}">
      <ol class="text-color-palette__list">
        <li class="text-color-palette__row text-color-palette__row--locked"></li>
        ${rows.join('')}
      </ol>
      <button type="button" class="text-color-palette__add">add</button>
      <span class="text-color-palette__count" data-format="{current} / ${max}"></span>
      <template class="text-color-palette__template">${row('__INDEX__', '', '')}</template>
    </section>`;

  const root = document.querySelector<HTMLElement>('.text-color-palette');
  if (!root) throw new Error('missing root');
  setupTextColorPalette(root);
  return root;
};

const codeInputs = () =>
  document.querySelectorAll<HTMLInputElement>(
    '.text-color-palette__list .text-color-palette__code',
  );

const paste = (input: HTMLInputElement, text: string) => {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: { getData: () => text },
  });
  input.dispatchEvent(event);
  return event;
};

afterEach(() => {
  document.body.innerHTML = '';
});

describe('sanitizeHex', () => {
  it('keeps only hexadecimal digits in lower case', () => {
    expect(sanitizeHex('# FF 00 aa')).toBe('ff00aa');
    expect(sanitizeHex(' #c14C8A\n')).toBe('c14c8a');
    expect(sanitizeHex('rgb(1,2,3)')).toBe('b123');
  });

  it('accepts 3 or 6 digits only', () => {
    expect(isValidHex('f00')).toBe(true);
    expect(isValidHex('ff0000')).toBe(true);
    expect(isValidHex('ff00')).toBe(false);
    expect(isValidHex('ff00000')).toBe(false);
  });
});

describe('setupTextColorPalette', () => {
  it('cleans a pasted code before the length limit can cut it', () => {
    mount([row('0', '빨강', '')]);
    const [input] = codeInputs();
    if (!input) throw new Error('missing input');

    const event = paste(input, '  # CF 51 48  ');

    expect(event.defaultPrevented).toBe(true);
    expect(input.value).toBe('cf5148');
    const preview = document.querySelector<HTMLElement>(
      '.text-color-palette__preview--dark',
    );
    expect(preview?.style.color).toBe('rgb(207, 81, 72)');
  });

  it('strips typed spaces and symbols and clears an invalid preview', () => {
    mount([row('0', '빨강', 'cf5148')]);
    const [input] = codeInputs();
    if (!input) throw new Error('missing input');

    input.value = 'c f-5';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(input.value).toBe('cf5');
    input.value = 'cf51';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const preview = document.querySelector<HTMLElement>(
      '.text-color-palette__preview--light',
    );
    expect(preview?.style.color).toBe('');
  });

  it('adds rows with unique names up to the limit', () => {
    const root = mount([row('0', '빨강', 'cf5148')], 3);
    const add = root.querySelector<HTMLButtonElement>(
      '.text-color-palette__add',
    );

    add?.click();
    add?.click();

    expect(Array.from(codeInputs()).map((input) => input.name)).toEqual([
      'form_admin_settings[text_color_palette][0][hex]',
      'form_admin_settings[text_color_palette][1][hex]',
      'form_admin_settings[text_color_palette][2][hex]',
    ]);
    expect(add?.disabled).toBe(true);
    expect(root.querySelector('.text-color-palette__count')?.textContent).toBe(
      '3 / 3',
    );
  });

  it('removes a row and frees a slot', () => {
    const root = mount(
      [row('0', 'a', 'fff'), row('1', 'b', '000'), row('2', 'c', 'f00')],
      3,
    );
    const add = root.querySelector<HTMLButtonElement>(
      '.text-color-palette__add',
    );
    expect(add?.disabled).toBe(true);

    root
      .querySelector<HTMLButtonElement>('.text-color-palette__remove')
      ?.click();

    expect(codeInputs()).toHaveLength(2);
    expect(add?.disabled).toBe(false);
    expect(root.querySelector('.text-color-palette__count')?.textContent).toBe(
      '2 / 3',
    );
  });

  it('disables the outer arrows and moves rows with renumbered fields', () => {
    const root = mount(
      [row('0', 'a', 'fff'), row('1', 'b', '000'), row('2', 'c', 'f00')],
      3,
    );
    const ups = () =>
      Array.from(
        root.querySelectorAll<HTMLButtonElement>('.text-color-palette__up'),
      ).map((button) => button.disabled);
    const downs = () =>
      Array.from(
        root.querySelectorAll<HTMLButtonElement>('.text-color-palette__down'),
      ).map((button) => button.disabled);
    const order = () =>
      Array.from(codeInputs()).map((input) => [input.name, input.value]);

    expect(ups()).toEqual([true, false, false]);
    expect(downs()).toEqual([false, false, true]);

    root
      .querySelectorAll<HTMLButtonElement>('.text-color-palette__up')[2]
      ?.click();

    expect(order()).toEqual([
      ['form_admin_settings[text_color_palette][0][hex]', 'fff'],
      ['form_admin_settings[text_color_palette][1][hex]', 'f00'],
      ['form_admin_settings[text_color_palette][2][hex]', '000'],
    ]);
    expect(ups()).toEqual([true, false, false]);
    expect(downs()).toEqual([false, false, true]);
  });

  it('never moves a row above the locked default row', () => {
    const root = mount([row('0', 'a', 'fff'), row('1', 'b', '000')], 3);
    const firstUp = root.querySelector<HTMLButtonElement>(
      '.text-color-palette__up',
    );
    if (!firstUp) throw new Error('missing button');

    firstUp.disabled = false;
    firstUp.click();

    expect(
      root.querySelector('.text-color-palette__list')?.firstElementChild
        ?.classList,
    ).toContain('text-color-palette__row--locked');
    expect(Array.from(codeInputs()).map((input) => input.value)).toEqual([
      'fff',
      '000',
    ]);
  });

  it('announces every scripted change with a change event', () => {
    const root = mount([row('0', 'a', 'fff'), row('1', 'b', '000')], 3);
    let changes = 0;
    root.addEventListener('change', () => {
      changes += 1;
    });

    root.querySelector<HTMLButtonElement>('.text-color-palette__add')?.click();
    root
      .querySelectorAll<HTMLButtonElement>('.text-color-palette__down')[0]
      ?.click();
    root
      .querySelector<HTMLButtonElement>('.text-color-palette__remove')
      ?.click();
    const [input] = codeInputs();
    if (!input) throw new Error('missing input');
    paste(input, 'abc');

    expect(changes).toBe(4);
  });
});
