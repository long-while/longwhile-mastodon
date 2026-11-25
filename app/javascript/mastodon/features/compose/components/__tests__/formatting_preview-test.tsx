import { act, fireEvent, screen } from '@testing-library/react';

import { render } from 'mastodon/test_helpers';

import {
  FormattingPreview,
  hasFormatting,
  PREVIEW_DEBOUNCE_MS,
} from '../formatting_preview';

const apiRequest = vi.fn();

vi.mock('mastodon/api', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args) as unknown,
}));

describe('hasFormatting', () => {
  it('spots the decoration markers', () => {
    expect(hasFormatting('[color:f00]빨강[/color]')).toBe(true);
    expect(hasFormatting('**굵게**')).toBe(true);
    expect(hasFormatting('*기울임*')).toBe(true);
    expect(hasFormatting('~~~취소~~~')).toBe(true);
    expect(hasFormatting('[center]가운데[/center]')).toBe(true);
  });

  it('ignores ordinary text', () => {
    expect(hasFormatting('그냥 글')).toBe(false);
    expect(hasFormatting('2 * 3 = 6')).toBe(false);
  });
});

describe('FormattingPreview', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    apiRequest.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('asks the server once after typing stops and shows its HTML', async () => {
    apiRequest.mockResolvedValue({
      content: '<p><strong>굵게</strong></p>',
      spoiler_text: '',
    });

    const { container, rerender } = render(
      <FormattingPreview text='**굵' spoilerText='' />,
    );
    rerender(<FormattingPreview text='**굵게**' spoilerText='' />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PREVIEW_DEBOUNCE_MS);
    });

    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(apiRequest).toHaveBeenCalledWith(
      'POST',
      'v1/statuses/preview',
      expect.objectContaining({
        data: { status: '**굵게**', spoiler_text: '' },
      }),
    );
    expect(
      container.querySelector('.compose-form__preview__body strong')
        ?.textContent,
    ).toBe('굵게');
  });

  it('does not ask for an empty text', async () => {
    render(<FormattingPreview text='   ' spoilerText='' />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PREVIEW_DEBOUNCE_MS * 2);
    });

    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('cancels the earlier request when the text changes', async () => {
    apiRequest.mockResolvedValue({ content: '<p>x</p>', spoiler_text: '' });

    const { rerender } = render(<FormattingPreview text='a' spoilerText='' />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PREVIEW_DEBOUNCE_MS);
    });

    const firstSignal = (
      apiRequest.mock.calls[0]?.[2] as { signal: AbortSignal }
    ).signal;
    rerender(<FormattingPreview text='ab' spoilerText='' />);

    expect(firstSignal.aborted).toBe(true);
  });

  it('dims the stale body on failure and retries at once from the button', async () => {
    apiRequest.mockResolvedValueOnce({
      content: '<p>old</p>',
      spoiler_text: '',
    });

    const { container, rerender } = render(
      <FormattingPreview text='a' spoilerText='' />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PREVIEW_DEBOUNCE_MS);
    });

    apiRequest.mockRejectedValueOnce(new Error('boom'));
    rerender(<FormattingPreview text='ab' spoilerText='' />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PREVIEW_DEBOUNCE_MS);
    });

    const body = () => container.querySelector('.compose-form__preview__body');

    expect(
      body()?.classList.contains('compose-form__preview__body--stale'),
    ).toBe(true);
    expect(screen.getByRole('alert').textContent).toContain('Please try again');

    apiRequest.mockResolvedValueOnce({
      content: '<p>new</p>',
      spoiler_text: '',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(apiRequest).toHaveBeenCalledTimes(3);
    expect(body()?.textContent).toBe('new');
    expect(
      body()?.classList.contains('compose-form__preview__body--stale'),
    ).toBe(false);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('uses the given id on the section so a button can control it', () => {
    const { container } = render(
      <FormattingPreview id='preview-1' text='   ' spoilerText='' />,
    );

    expect(container.querySelector('section')?.id).toBe('preview-1');
  });
});
