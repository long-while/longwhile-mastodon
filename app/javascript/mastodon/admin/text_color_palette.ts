const HEX_LENGTH = 6;
const VALID_HEX = /^(?:[0-9a-f]{3}|[0-9a-f]{6})$/;

export const sanitizeHex = (value: string) =>
  value.replace(/[^0-9a-fA-F]/g, '').toLowerCase();

export const isValidHex = (value: string) => VALID_HEX.test(value);

const ROW = '.text-color-palette__row:not(.text-color-palette__row--locked)';

const updatePreview = (row: Element, hex: string) => {
  row
    .querySelectorAll<HTMLElement>('.text-color-palette__preview')
    .forEach((preview) => {
      preview.style.color = isValidHex(hex) ? `#${hex}` : '';
    });
};

const setCleanValue = (
  input: HTMLInputElement,
  value: string,
  caret: number,
) => {
  const clean = sanitizeHex(value).slice(0, HEX_LENGTH);
  const position = Math.min(
    sanitizeHex(value.slice(0, caret)).length,
    clean.length,
  );

  if (input.value !== clean) input.value = clean;
  input.setSelectionRange(position, position);

  const row = input.closest('.text-color-palette__row');
  if (row) updatePreview(row, clean);
};

const handleCodeInput = (input: HTMLInputElement) => {
  setCleanValue(input, input.value, input.selectionStart ?? input.value.length);
};

const handleCodePaste = (input: HTMLInputElement, event: ClipboardEvent) => {
  const pasted = event.clipboardData?.getData('text') ?? '';
  event.preventDefault();

  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  const before = input.value.slice(0, start) + sanitizeHex(pasted);

  setCleanValue(input, before + input.value.slice(end), before.length);
};

const notifyChange = (target: Element) => {
  target.dispatchEvent(new Event('change', { bubbles: true }));
};

const rows = (root: HTMLElement) =>
  Array.from(root.querySelectorAll<HTMLElement>(ROW));

const FIELD = /^form_admin_settings\[text_color_palette\]\[[^\]]*\]/;

const refresh = (root: HTMLElement) => {
  const all = rows(root);

  all.forEach((row, index) => {
    row.querySelectorAll<HTMLInputElement>('input[name]').forEach((input) => {
      input.name = input.name.replace(
        FIELD,
        `form_admin_settings[text_color_palette][${index}]`,
      );
    });

    const up = row.querySelector<HTMLButtonElement>('.text-color-palette__up');
    const down = row.querySelector<HTMLButtonElement>(
      '.text-color-palette__down',
    );
    if (up) up.disabled = index === 0;
    if (down) down.disabled = index === all.length - 1;
  });

  const add = root.querySelector<HTMLButtonElement>('.text-color-palette__add');
  const counter = root.querySelector<HTMLElement>('.text-color-palette__count');

  if (add) add.disabled = all.length >= Number(root.dataset.max);
  if (counter?.dataset.format) {
    counter.textContent = counter.dataset.format.replace(
      '{current}',
      String(all.length),
    );
  }
};

const addRow = (root: HTMLElement) => {
  const template = root.querySelector<HTMLTemplateElement>(
    '.text-color-palette__template',
  );
  const list = root.querySelector('.text-color-palette__list');
  if (!template || !list || rows(root).length >= Number(root.dataset.max)) {
    return;
  }

  const row = template.content.firstElementChild?.cloneNode(true);
  if (!(row instanceof HTMLElement)) return;

  list.appendChild(row);
  refresh(root);
  notifyChange(root);
  row.querySelector<HTMLInputElement>('.text-color-palette__name')?.focus();
};

const removeRow = (root: HTMLElement, button: Element) => {
  const row = button.closest(ROW);
  if (!row) return;

  const next = row.nextElementSibling ?? row.previousElementSibling;
  row.remove();
  refresh(root);
  notifyChange(root);

  const focusTarget =
    next?.querySelector<HTMLElement>('.text-color-palette__remove') ??
    root.querySelector<HTMLElement>('.text-color-palette__add');
  focusTarget?.focus();
};

const moveRow = (root: HTMLElement, button: HTMLButtonElement, up: boolean) => {
  const row = button.closest(ROW);
  const sibling = up ? row?.previousElementSibling : row?.nextElementSibling;
  if (!row || !sibling?.matches(ROW)) return;

  if (up) sibling.before(row);
  else sibling.after(row);
  refresh(root);
  notifyChange(root);

  const other = up ? '.text-color-palette__down' : '.text-color-palette__up';
  const target = button.disabled
    ? row.querySelector<HTMLButtonElement>(other)
    : button;
  target?.focus();
};

const handleClick = (root: HTMLElement, event: Event) => {
  if (!(event.target instanceof Element)) return;

  if (event.target.closest('.text-color-palette__add')) {
    addRow(root);
    return;
  }

  const action = event.target.closest<HTMLButtonElement>(
    '.text-color-palette__action',
  );
  if (!action || action.disabled) return;

  if (action.classList.contains('text-color-palette__remove')) {
    removeRow(root, action);
  } else {
    moveRow(root, action, action.classList.contains('text-color-palette__up'));
  }
};

const asCodeInput = (target: EventTarget | null) =>
  target instanceof HTMLInputElement &&
  target.classList.contains('text-color-palette__code')
    ? target
    : null;

export const setupTextColorPalette = (root: HTMLElement) => {
  root.addEventListener('click', (event) => {
    handleClick(root, event);
  });

  root.addEventListener('input', (event) => {
    const input = asCodeInput(event.target);
    if (input) handleCodeInput(input);
  });

  root.addEventListener('paste', (event) => {
    const input = asCodeInput(event.target);
    if (!input) return;

    handleCodePaste(input, event);
    notifyChange(input);
  });

  refresh(root);
};
