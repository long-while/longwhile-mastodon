import { useRef } from 'react';

import { act, fireEvent, screen } from '@testing-library/react';

import { render } from 'mastodon/test_helpers';

import { FormattingToolbar } from '../formatting_toolbar';

const Harness: React.FC<{ initial: string }> = ({ initial }) => {
  const ref = useRef<HTMLTextAreaElement>(null);

  return (
    <>
      <textarea ref={ref} defaultValue={initial} aria-label='post' />
      <FormattingToolbar textareaRef={ref} />
    </>
  );
};

const setup = (initial: string, start: number, end: number) => {
  render(<Harness initial={initial} />);
  const textarea = screen.getByLabelText<HTMLTextAreaElement>('post');

  act(() => {
    textarea.focus();
    textarea.setSelectionRange(start, end);
    document.dispatchEvent(new Event('selectionchange'));
  });

  return textarea;
};

describe('FormattingToolbar', () => {
  it('stays hidden while nothing is selected', () => {
    setup('hello', 2, 2);
    expect(screen.queryByRole('toolbar')).toBeNull();
  });

  it('appears for a selection and wraps it', () => {
    const textarea = setup('hello world', 6, 11);

    expect(screen.queryByRole('toolbar')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Bold' }));

    expect(textarea.value).toBe('hello **world**');
    expect([textarea.selectionStart, textarea.selectionEnd]).toEqual([8, 13]);
    expect(
      screen.getByRole('button', { name: 'Bold' }).getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('picks a palette color and closes the panel', () => {
    const textarea = setup('hi', 0, 2);

    fireEvent.click(screen.getByRole('button', { name: 'Text color' }));
    fireEvent.click(screen.getByRole('button', { name: /Red text/ }));

    expect(textarea.value).toBe('[color:cf5148]hi[/color]');
    expect(screen.queryByRole('button', { name: /Red text/ })).toBeNull();
  });

  it('toggles with the keyboard shortcut', () => {
    const textarea = setup('hi', 0, 2);

    fireEvent.keyDown(textarea, { key: 'u', ctrlKey: true, metaKey: true });

    expect(textarea.value).toBe('[u]hi[/u]');
  });

  it('closes on Escape without blurring the textarea', () => {
    const textarea = setup('hi', 0, 2);

    fireEvent.keyDown(textarea, { key: 'Escape' });

    expect(screen.queryByRole('toolbar')).toBeNull();
    expect(document.activeElement).toBe(textarea);
  });

  it('hides when the textarea loses focus', () => {
    const textarea = setup('hi', 0, 2);

    act(() => {
      textarea.blur();
    });

    expect(screen.queryByRole('toolbar')).toBeNull();
  });
});
