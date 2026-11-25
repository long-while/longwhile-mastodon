import type { TextSelectionEdit } from './text_formatting';

const MIRRORED_PROPERTIES = [
  'boxSizing',
  'width',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderStyle',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'fontStyle',
  'fontVariant',
  'fontWeight',
  'fontStretch',
  'fontSize',
  'fontSizeAdjust',
  'lineHeight',
  'fontFamily',
  'textAlign',
  'textTransform',
  'textIndent',
  'letterSpacing',
  'wordSpacing',
  'tabSize',
  'direction',
] as const;

export interface CaretRect {
  left: number;
  top: number;
  bottom: number;
}

export const getCaretRect = (
  textarea: HTMLTextAreaElement,
  position: number,
): CaretRect => {
  const computed = window.getComputedStyle(textarea);
  const mirror = document.createElement('div');

  for (const property of MIRRORED_PROPERTIES) {
    mirror.style[property] = computed[property];
  }

  Object.assign(mirror.style, {
    position: 'absolute',
    top: '0',
    left: '-9999px',
    visibility: 'hidden',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
    overflow: 'hidden',
    height: 'auto',
  });

  mirror.textContent = textarea.value.slice(0, position);
  const marker = document.createElement('span');
  marker.textContent = textarea.value.slice(position, position + 1) || '.';
  mirror.appendChild(marker);
  document.body.appendChild(mirror);

  const box = textarea.getBoundingClientRect();
  const left = box.left + marker.offsetLeft - textarea.scrollLeft;
  const top = box.top + marker.offsetTop - textarea.scrollTop;
  const lineHeight = parseFloat(computed.lineHeight) || marker.offsetHeight;

  mirror.remove();

  return { left, top, bottom: top + lineHeight };
};

const setNativeValue = (textarea: HTMLTextAreaElement, value: string) => {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    'value',
  )?.set;

  setter?.call(textarea, value);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
};

const insertWithUndo = (text: string): boolean => {
  const maybe = document as { execCommand?: unknown };
  if (typeof maybe.execCommand !== 'function') return false;

  // eslint-disable-next-line @typescript-eslint/no-deprecated
  return document.execCommand('insertText', false, text);
};

export const changedRange = (previous: string, next: string) => {
  let prefix = 0;
  const shorter = Math.min(previous.length, next.length);

  while (prefix < shorter && previous[prefix] === next[prefix]) prefix++;

  let suffix = 0;

  while (
    suffix < shorter - prefix &&
    previous[previous.length - 1 - suffix] === next[next.length - 1 - suffix]
  ) {
    suffix++;
  }

  return { prefix, suffix };
};

export const applySelectionEdit = (
  textarea: HTMLTextAreaElement,
  edit: TextSelectionEdit,
) => {
  const previous = textarea.value;

  if (previous !== edit.text) {
    const { prefix, suffix } = changedRange(previous, edit.text);

    textarea.focus();
    textarea.setSelectionRange(prefix, previous.length - suffix);

    const replacement = edit.text.slice(prefix, edit.text.length - suffix);
    const inserted = insertWithUndo(replacement);

    if (!inserted || textarea.value !== edit.text) {
      setNativeValue(textarea, edit.text);
    }
  }

  textarea.setSelectionRange(edit.start, edit.end);
};
