import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

import { defineMessages, useIntl } from 'react-intl';

import classNames from 'classnames';

import BoldIcon from '@/styles/bird-theme-svg/bold.svg?react';
import ItalicIcon from '@/styles/bird-theme-svg/italic.svg?react';
import PaintIcon from '@/styles/bird-theme-svg/paint.svg?react';
import StrikeIcon from '@/styles/bird-theme-svg/strikethrough.svg?react';
import ClearIcon from '@/styles/bird-theme-svg/typography-off.svg?react';
import UnderlineIcon from '@/styles/bird-theme-svg/underline.svg?react';
import { Icon } from 'mastodon/components/icon';
import type { IconProp } from 'mastodon/components/icon';

import type {
  ActiveMarks,
  InlineMark,
  TextSelectionEdit,
} from '../util/text_formatting';
import {
  TEXT_COLORS,
  applyTextColor,
  clearFormatting,
  getActiveMarks,
  toggleMark,
} from '../util/text_formatting';
import { applySelectionEdit, getCaretRect } from '../util/textarea_selection';

const messages = defineMessages({
  toolbar: {
    id: 'compose_form.format.toolbar',
    defaultMessage: 'Text formatting',
  },
  textColor: {
    id: 'compose_form.format.text_color',
    defaultMessage: 'Text color',
  },
  bold: { id: 'compose_form.format.bold', defaultMessage: 'Bold' },
  italic: { id: 'compose_form.format.italic', defaultMessage: 'Italic' },
  underline: {
    id: 'compose_form.format.underline',
    defaultMessage: 'Underline',
  },
  strike: { id: 'compose_form.format.strike', defaultMessage: 'Strikethrough' },
  clear: {
    id: 'compose_form.format.clear',
    defaultMessage: 'Clear formatting',
  },
  colorDefault: {
    id: 'compose_form.format.color.default',
    defaultMessage: 'Default text',
  },
  gray: { id: 'compose_form.format.color.gray', defaultMessage: 'Gray text' },
  brown: {
    id: 'compose_form.format.color.brown',
    defaultMessage: 'Brown text',
  },
  orange: {
    id: 'compose_form.format.color.orange',
    defaultMessage: 'Orange text',
  },
  yellow: {
    id: 'compose_form.format.color.yellow',
    defaultMessage: 'Yellow text',
  },
  green: {
    id: 'compose_form.format.color.green',
    defaultMessage: 'Green text',
  },
  blue: { id: 'compose_form.format.color.blue', defaultMessage: 'Blue text' },
  purple: {
    id: 'compose_form.format.color.purple',
    defaultMessage: 'Purple text',
  },
  pink: { id: 'compose_form.format.color.pink', defaultMessage: 'Pink text' },
  red: { id: 'compose_form.format.color.red', defaultMessage: 'Red text' },
});

type ColorMessageKey =
  | 'gray'
  | 'brown'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'purple'
  | 'pink'
  | 'red';

const MARK_BUTTONS: {
  mark: InlineMark;
  icon: IconProp;
  label: 'bold' | 'italic' | 'underline' | 'strike';
  shortcut?: string;
}[] = [
  { mark: 'bold', icon: BoldIcon, label: 'bold', shortcut: 'B' },
  { mark: 'italic', icon: ItalicIcon, label: 'italic', shortcut: 'I' },
  { mark: 'underline', icon: UnderlineIcon, label: 'underline', shortcut: 'U' },
  { mark: 'strike', icon: StrikeIcon, label: 'strike' },
];

const SHORTCUT_MARKS: Partial<Record<string, InlineMark>> = {
  b: 'bold',
  i: 'italic',
  u: 'underline',
};

const GAP = 6;
const EDGE = 8;

interface Range {
  start: number;
  end: number;
}

type TextareaRef = React.RefObject<HTMLTextAreaElement | null>;
type DivRef = React.RefObject<HTMLDivElement | null>;
type Command = (text: string, start: number, end: number) => TextSelectionEdit;

const isMac = () => /Mac|iPhone|iPad/.test(navigator.userAgent);

const selectionKey = (el: HTMLTextAreaElement) =>
  `${el.selectionStart}:${el.selectionEnd}:${el.value}`;

const readRange = (
  el: HTMLTextAreaElement | null,
  dismissed: string | null,
): Range | null => {
  if (!el || el.disabled || document.activeElement !== el) return null;
  if (el.selectionStart === el.selectionEnd) return null;
  if (selectionKey(el) === dismissed) return null;

  return { start: el.selectionStart, end: el.selectionEnd };
};

type Listener = [EventTarget, string, EventListener, boolean?];

const listenAll = (listeners: Listener[]) => {
  listeners.forEach(([target, name, handler, capture]) => {
    target.addEventListener(name, handler, capture);
  });

  return () => {
    listeners.forEach(([target, name, handler, capture]) => {
      target.removeEventListener(name, handler, capture);
    });
  };
};

const useTextareaSelection = (textareaRef: TextareaRef, toolbarRef: DivRef) => {
  const [range, setRange] = useState<Range | null>(null);
  const mouseDownRef = useRef(false);
  const dismissedRef = useRef<string | null>(null);

  const refresh = useCallback(() => {
    const next = mouseDownRef.current
      ? null
      : readRange(textareaRef.current, dismissedRef.current);

    setRange((prev) =>
      prev?.start === next?.start && prev?.end === next?.end ? prev : next,
    );
  }, [textareaRef]);

  const dismiss = useCallback(() => {
    const el = textareaRef.current;
    if (el) dismissedRef.current = selectionKey(el);
    setRange(null);
  }, [textareaRef]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;

    const handleDown = (e: Event) => {
      if ((e as PointerEvent).pointerType !== 'mouse') return;
      mouseDownRef.current = true;
      setRange(null);
    };
    const handleUp = () => {
      if (!mouseDownRef.current) return;
      mouseDownRef.current = false;
      requestAnimationFrame(refresh);
    };
    const handleBlur = (e: Event) => {
      const next = (e as FocusEvent).relatedTarget;
      if (next instanceof Node && toolbarRef.current?.contains(next)) return;
      setRange(null);
    };

    return listenAll([
      [el, 'pointerdown', handleDown],
      [el, 'keyup', refresh],
      [el, 'select', refresh],
      [el, 'input', refresh],
      [el, 'blur', handleBlur],
      [window, 'pointerup', handleUp],
      [window, 'pointercancel', handleUp],
      [document, 'selectionchange', refresh],
    ]);
  }, [textareaRef, toolbarRef, refresh]);

  return { range, refresh, dismiss };
};

const useFormattingCommand = (textareaRef: TextareaRef, refresh: () => void) =>
  useCallback(
    (command: Command) => {
      const el = textareaRef.current;
      if (!el || el.disabled) return;

      applySelectionEdit(
        el,
        command(el.value, el.selectionStart, el.selectionEnd),
      );
      refresh();
    },
    [textareaRef, refresh],
  );

const useFormattingKeys = (
  textareaRef: TextareaRef,
  visible: boolean,
  run: (command: Command) => void,
  dismiss: () => void,
) => {
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && visible) {
        e.preventDefault();
        e.stopPropagation();
        dismiss();
        return;
      }

      const mark = SHORTCUT_MARKS[e.key.toLowerCase()];
      const modifier = isMac() ? e.metaKey : e.ctrlKey;
      const empty = el.selectionStart === el.selectionEnd;
      if (!mark || !modifier || e.altKey || e.shiftKey || empty) return;

      e.preventDefault();
      run((text, start, end) => toggleMark(text, start, end, mark));
    };

    el.addEventListener('keydown', handleKeyDown);
    return () => {
      el.removeEventListener('keydown', handleKeyDown);
    };
  }, [textareaRef, visible, run, dismiss]);
};

const visibleBottom = () => {
  const viewport = window.visualViewport;
  return viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
};

const placeToolbar = (
  node: HTMLElement,
  el: HTMLTextAreaElement,
  range: Range,
) => {
  const caretEnd = getCaretRect(el, range.end);
  const { width, height } = node.getBoundingClientRect();
  const maxLeft = window.innerWidth - width - EDGE;
  let top = caretEnd.bottom + GAP;

  if (top + height > visibleBottom() - EDGE) {
    top = getCaretRect(el, range.start).top - height - GAP;
  }

  const box = el.getBoundingClientRect();
  const offscreen = caretEnd.bottom < box.top || caretEnd.top > box.bottom;

  node.style.left = `${Math.max(EDGE, Math.min(caretEnd.left + GAP, maxLeft))}px`;
  node.style.top = `${Math.max(EDGE, top)}px`;
  node.style.visibility = offscreen ? 'hidden' : '';
};

const usePlacement = (
  nodeRef: DivRef,
  textareaRef: TextareaRef,
  range: Range | null,
  colorOpen: boolean,
) => {
  const place = useCallback(() => {
    const node = nodeRef.current;
    const el = textareaRef.current;
    if (node && el && range) placeToolbar(node, el, range);
  }, [nodeRef, textareaRef, range]);

  useLayoutEffect(place, [place, colorOpen]);

  useEffect(() => {
    if (!range) return;

    const listeners: Listener[] = [
      [window, 'resize', place],
      [document, 'scroll', place, true],
    ];
    if (window.visualViewport) {
      listeners.push([window.visualViewport, 'resize', place]);
    }

    return listenAll(listeners);
  }, [range, place]);
};

const ColorPanel: React.FC<{
  active: string | null;
  onPick: (hex: string | null) => void;
}> = ({ active, onPick }) => {
  const intl = useIntl();
  const options = [
    {
      id: 'default',
      hex: null,
      label: intl.formatMessage(messages.colorDefault),
    },
    ...TEXT_COLORS.map((color) => ({
      id: color.id,
      hex: color.hex,
      label: intl.formatMessage(messages[color.id as ColorMessageKey]),
    })),
  ];

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      onPick(e.currentTarget.dataset.hex ?? null);
    },
    [onPick],
  );

  return (
    <div
      className='compose-format-toolbar__colors'
      role='group'
      aria-label={intl.formatMessage(messages.textColor)}
    >
      {options.map((option) => (
        <button
          key={option.id}
          type='button'
          className={classNames('compose-format-toolbar__color', {
            'compose-format-toolbar__color--active': option.hex === active,
          })}
          aria-pressed={option.hex === active}
          data-hex={option.hex ?? undefined}
          onClick={handleClick}
        >
          <span
            className='compose-format-toolbar__swatch'
            style={option.hex ? { color: `#${option.hex}` } : undefined}
            aria-hidden='true'
          >
            A
          </span>
          {option.label}
        </button>
      ))}
    </div>
  );
};

const MarkButtons: React.FC<{
  marks: ActiveMarks;
  onMark: (mark: InlineMark) => void;
}> = ({ marks, onMark }) => {
  const intl = useIntl();
  const modifier = isMac() ? '⌘' : 'Ctrl+';

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const mark = e.currentTarget.dataset.mark as InlineMark | undefined;
      if (mark) onMark(mark);
    },
    [onMark],
  );

  return MARK_BUTTONS.map(({ mark, icon, label, shortcut }) => {
    const text = intl.formatMessage(messages[label]);

    return (
      <button
        key={mark}
        type='button'
        className={classNames('compose-format-toolbar__button', {
          'compose-format-toolbar__button--active': marks[mark],
        })}
        title={shortcut ? `${text} (${modifier}${shortcut})` : text}
        aria-label={text}
        aria-pressed={marks[mark]}
        data-mark={mark}
        onClick={handleClick}
      >
        <Icon id={`format-${mark}`} icon={icon} />
      </button>
    );
  });
};

const ToolbarRow: React.FC<{
  marks: ActiveMarks;
  colorOpen: boolean;
  onToggleColor: () => void;
  onMark: (mark: InlineMark) => void;
  onClear: () => void;
}> = ({ marks, colorOpen, onToggleColor, onMark, onClear }) => {
  const intl = useIntl();

  return (
    <div className='compose-format-toolbar__row'>
      <button
        type='button'
        className={classNames('compose-format-toolbar__button', {
          'compose-format-toolbar__button--active': colorOpen,
        })}
        title={intl.formatMessage(messages.textColor)}
        aria-label={intl.formatMessage(messages.textColor)}
        aria-expanded={colorOpen}
        onClick={onToggleColor}
      >
        <Icon
          id='format-color'
          icon={PaintIcon}
          style={
            marks.color && !colorOpen ? { color: `#${marks.color}` } : undefined
          }
        />
      </button>

      <MarkButtons marks={marks} onMark={onMark} />

      <button
        type='button'
        className='compose-format-toolbar__button'
        title={intl.formatMessage(messages.clear)}
        aria-label={intl.formatMessage(messages.clear)}
        onClick={onClear}
      >
        <Icon id='format-clear' icon={ClearIcon} />
      </button>
    </div>
  );
};

const keepSelection = (e: React.SyntheticEvent) => {
  e.preventDefault();
};

const useToolbarHandlers = (run: (command: Command) => void) => ({
  handleMark: useCallback(
    (mark: InlineMark) => {
      run((t, s, e) => toggleMark(t, s, e, mark));
    },
    [run],
  ),
  handleClear: useCallback(() => {
    run(clearFormatting);
  }, [run]),
  handlePick: useCallback(
    (hex: string | null) => {
      run((t, s, e) => applyTextColor(t, s, e, hex));
    },
    [run],
  ),
});

export const FormattingToolbar: React.FC<{ textareaRef: TextareaRef }> = ({
  textareaRef,
}) => {
  const intl = useIntl();
  const nodeRef = useRef<HTMLDivElement>(null);
  const { range, refresh, dismiss } = useTextareaSelection(
    textareaRef,
    nodeRef,
  );
  const [colorOpenFor, setColorOpenFor] = useState<Range | null>(null);
  const colorOpen = range !== null && colorOpenFor === range;
  const run = useFormattingCommand(textareaRef, refresh);
  const { handleMark, handleClear, handlePick } = useToolbarHandlers(run);

  useFormattingKeys(textareaRef, range !== null, run, dismiss);
  usePlacement(nodeRef, textareaRef, range, colorOpen);

  const handleToggleColor = useCallback(() => {
    setColorOpenFor((open) => (open === range ? null : range));
  }, [range]);
  const handlePickAndClose = useCallback(
    (hex: string | null) => {
      handlePick(hex);
      setColorOpenFor(null);
    },
    [handlePick],
  );

  const el = textareaRef.current;
  if (!range || !el) return null;

  const marks = getActiveMarks(el.value, range.start, range.end);

  return createPortal(
    <div
      ref={nodeRef}
      className='dropdown-menu compose-format-toolbar'
      role='toolbar'
      aria-label={intl.formatMessage(messages.toolbar)}
      onPointerDown={keepSelection}
      onMouseDown={keepSelection}
    >
      <ToolbarRow
        marks={marks}
        colorOpen={colorOpen}
        onToggleColor={handleToggleColor}
        onMark={handleMark}
        onClear={handleClear}
      />
      {colorOpen && (
        <ColorPanel active={marks.color} onPick={handlePickAndClose} />
      )}
    </div>,
    document.body,
  );
};
