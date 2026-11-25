import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { defineMessages, useIntl } from 'react-intl';

import classNames from 'classnames';

import { apiRequest } from 'mastodon/api';

const messages = defineMessages({
  title: {
    id: 'compose_form.preview.title',
    defaultMessage: 'Formatting preview',
  },
  loading: {
    id: 'compose_form.preview.loading',
    defaultMessage: 'Updating preview…',
  },
  error: {
    id: 'compose_form.preview.error',
    defaultMessage:
      'The preview could not be loaded. Please try again in a moment.',
  },
  retry: {
    id: 'compose_form.preview.retry',
    defaultMessage: 'Try again',
  },
  empty: {
    id: 'compose_form.preview.empty',
    defaultMessage: 'Start writing to see the preview',
  },
});

export const PREVIEW_DEBOUNCE_MS = 400;

const FORMATTING_PATTERN =
  /\*\*|\*\S[^*\n]*\S?\*|~~~|\[(?:color|bg):|\[\/?(?:center|right|left)\]/;

export const hasFormatting = (text: string) => FORMATTING_PATTERN.test(text);

interface PreviewResponse {
  content: string;
  spoiler_text: string;
}

type PreviewState =
  | { kind: 'empty' }
  | { kind: 'loading'; html: string | null }
  | { kind: 'ready'; html: string }
  | { kind: 'error'; html: string | null };

export const useFormattingPreview = (text: string, spoilerText: string) => {
  const [state, setState] = useState<PreviewState>({ kind: 'empty' });
  const [attempt, setAttempt] = useState(0);
  const retryImmediatelyRef = useRef(false);

  const retry = useCallback(() => {
    retryImmediatelyRef.current = true;
    setAttempt((count) => count + 1);
  }, []);

  useEffect(() => {
    if (!text.trim()) {
      setState({ kind: 'empty' });
      return;
    }

    const controller = new AbortController();

    setState((previous) => ({
      kind: 'loading',
      html: 'html' in previous ? previous.html : null,
    }));

    const delay = retryImmediatelyRef.current ? 0 : PREVIEW_DEBOUNCE_MS;
    retryImmediatelyRef.current = false;

    const timer = setTimeout(() => {
      apiRequest<PreviewResponse>('POST', 'v1/statuses/preview', {
        data: { status: text, spoiler_text: spoilerText },
        signal: controller.signal,
      })
        .then((response) => {
          setState({ kind: 'ready', html: response.content });
        })
        .catch(() => {
          if (controller.signal.aborted) return;

          setState((previous) => ({
            kind: 'error',
            html: 'html' in previous ? previous.html : null,
          }));
        });
    }, delay);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [text, spoilerText, attempt]);

  return { state, retry };
};

interface Props {
  text: string;
  spoilerText: string;
  id?: string;
}

export const FormattingPreview: React.FC<Props> = ({
  text,
  spoilerText,
  id,
}) => {
  const intl = useIntl();
  const generatedId = useId();
  const { state, retry } = useFormattingPreview(text, spoilerText);
  const html = 'html' in state ? state.html : null;

  const status =
    state.kind === 'loading' ? intl.formatMessage(messages.loading) : '';

  return (
    <section
      id={id ?? generatedId}
      className='compose-form__preview'
      aria-label={intl.formatMessage(messages.title)}
    >
      <div className='compose-form__preview__header'>
        <span>{intl.formatMessage(messages.title)}</span>
        <span className='compose-form__preview__status' aria-live='polite'>
          {status}
        </span>
      </div>

      {state.kind === 'error' && (
        <div className='compose-form__preview__error' role='alert'>
          <span>{intl.formatMessage(messages.error)}</span>
          <button type='button' className='link-button' onClick={retry}>
            {intl.formatMessage(messages.retry)}
          </button>
        </div>
      )}

      {state.kind === 'empty' ? (
        <p className='compose-form__preview__empty'>
          {intl.formatMessage(messages.empty)}
        </p>
      ) : (
        <>
          {spoilerText && (
            <p className='compose-form__preview__spoiler'>{spoilerText}</p>
          )}
          {html !== null && (
            <div
              className={classNames(
                'status__content__text status__content__text--visible compose-form__preview__body',
                {
                  'compose-form__preview__body--stale': state.kind === 'error',
                },
              )}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          )}
        </>
      )}
    </section>
  );
};
