import { useCallback, useEffect, useMemo, useRef } from 'react';

import { FormattedMessage } from 'react-intl';

import { Link } from 'react-router-dom';

import UntypedStatusContainer from 'mastodon/containers/status_container';
import type { Status } from 'mastodon/models/status';
import type { ThreadHeadState } from 'mastodon/reducers/thread_heads';
import { makeGetStatus } from 'mastodon/selectors';
import type { RootState } from 'mastodon/store';
import { useAppSelector } from 'mastodon/store';

interface Props {
  id: string;
  contextType?: string;
  onMoveUp?: (id: string, featured?: boolean) => void;
  onMoveDown?: (id: string, featured?: boolean) => void;
  hidden?: boolean;
  [key: string]: unknown;
}

const browserAnchorsScroll = () =>
  typeof CSS !== 'undefined' && CSS.supports('overflow-anchor', 'auto');

const StatusContainer =
  UntypedStatusContainer as unknown as React.ComponentType<
    Record<string, unknown>
  >;

type GetStatusSelector = (
  state: RootState,
  props: { id?: string | null; contextType?: string },
) => Status | null;

const getHeadEntry = (state: ThreadHeadState | undefined) =>
  state && typeof state === 'object' ? state : null;

export const ThreadPreviewItem: React.FC<Props> = ({
  id,
  contextType,
  onMoveUp,
  onMoveDown,
  ...other
}) => {
  const getStatus = useMemo(() => makeGetStatus() as GetStatusSelector, []);

  const targetId = useAppSelector(
    (state) =>
      (state.getIn(['statuses', id, 'reblog']) as string | null | undefined) ??
      id,
  );
  const inReplyToId = useAppSelector(
    (state) =>
      state.getIn(['statuses', targetId, 'in_reply_to_id']) as
        | string
        | null
        | undefined,
  );
  const entry = useAppSelector((state) =>
    getHeadEntry(state.get('thread_heads')[targetId]),
  );
  const headVisible = useAppSelector((state) =>
    entry
      ? getStatus(state, { id: entry.headId, contextType }) !== null
      : false,
  );

  const showHead = !!entry && headVisible;

  const handleHeadMoveUp = useCallback(() => onMoveUp?.(id), [onMoveUp, id]);
  const handleHeadMoveDown = useCallback(
    () => onMoveDown?.(id),
    [onMoveDown, id],
  );

  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const article = ref.current?.closest('article');
    if (
      !article ||
      browserAnchorsScroll() ||
      typeof ResizeObserver === 'undefined'
    ) {
      return undefined;
    }

    let previous: number | null = null;
    const observer = new ResizeObserver(() => {
      const rect = article.getBoundingClientRect();
      const height = rect.height;
      const before = previous;
      previous = height;

      if (before === null || before === height) return;
      if (rect.top + before <= 0) {
        window.scrollBy(0, height - before);
      }
    });

    observer.observe(article);
    return () => {
      observer.disconnect();
    };
  }, []);

  const reply = (
    <StatusContainer
      {...other}
      id={id}
      contextType={contextType}
      onMoveUp={onMoveUp}
      onMoveDown={onMoveDown}
      showThread={!showHead}
      previousId={showHead ? inReplyToId : undefined}
    />
  );

  if (!showHead) {
    return (
      <div ref={ref} className='thread-preview'>
        {reply}
      </div>
    );
  }

  return (
    <div ref={ref} className='thread-preview thread-preview--with-head'>
      <div className='thread-preview__head'>
        <StatusContainer
          {...other}
          id={entry.headId}
          contextType={contextType}
          threadHead
          showThread={false}
          onMoveUp={handleHeadMoveUp}
          onMoveDown={handleHeadMoveDown}
        />
      </div>

      {entry.omitted > 0 && (
        <Link to={`/statuses/${targetId}`} className='thread-preview__more'>
          <span className='thread-preview__more__line' aria-hidden />
          <span className='thread-preview__more__label'>
            <FormattedMessage
              id='thread_preview.show_more'
              defaultMessage='Show more replies'
            />
          </span>
        </Link>
      )}

      <div className='thread-preview__reply'>{reply}</div>
    </div>
  );
};
