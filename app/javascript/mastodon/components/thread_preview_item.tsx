import { useCallback, useEffect, useMemo, useRef } from 'react';

import { FormattedMessage } from 'react-intl';

import { Link } from 'react-router-dom';

import UntypedStatusContainer from 'mastodon/containers/status_container';
import type { Status } from 'mastodon/models/status';
import type { ThreadHeadState } from 'mastodon/reducers/thread_heads';
import { makeGetStatus } from 'mastodon/selectors';
import type { RootState } from 'mastodon/store';
import { useAppSelector } from 'mastodon/store';

// @_longwhile — 홈·퍼블릭 타임라인의 답글 한 항목(X 처럼).
//
//   답글 위에 타래의 시작 글을 그리고 선으로 잇는다. 사이에 글이 더 있으면 점선과
//   "더 많은 답글 보기"(답글의 상세 화면 — 거기서 타래 전체가 보인다)를 둔다.
//   시작 글이 없거나(아직 묻는 중·없음·실패) 필터로 숨겨지면 예전처럼 답글만, "~님에게" 줄과 함께.
//
//   **항목의 주인은 답글이다.** 목록이 이 컴포넌트를 `<article data-id={답글 id}>` 로 감싸므로
//   스크롤 복원(`utils/scroll_anchor.ts`)과 키보드 탐색은 그대로 항목 단위로 돈다. 시작 글은
//   그 안쪽에 그리고 focusable 을 빼서(Status 의 `threadHead`) j/k 가 거기 멈추지 않게 한다.

interface Props {
  id: string;
  contextType?: string;
  onMoveUp?: (id: string, featured?: boolean) => void;
  onMoveDown?: (id: string, featured?: boolean) => void;
  hidden?: boolean;
  [key: string]: unknown;
}

// 사파리에는 스크롤 앵커링(overflow-anchor)이 없다. 화면 위쪽 항목에 시작 글이 늦게 붙으면
// 그 높이만큼 보던 글이 아래로 밀린다. 크롬은 브라우저가 맞춰 준다 — 여기서 또 하면 두 번 움직인다.
const browserAnchorsScroll = () =>
  typeof CSS !== 'undefined' && CSS.supports('overflow-anchor', 'auto');

// <StatusContainer> 는 아직 타입이 없다(connect + injectIntl 이 추론한 props 가 틀리다).
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
  // 필터("숨기기")·뮤트 규칙은 Status 와 같은 선택자로 본다. 숨겨질 시작 글이면 그리지 않는다.
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

  // 사파리 보정. 이 항목(article)이 **화면 위쪽 끝보다 완전히 위**에 있을 때 높이가 바뀌면
  // 그만큼 내리거나 올린다. 시작 글이 늦게 붙을 때(+)뿐 아니라, 목록이 화면 밖 항목을
  // "붙기 전에 재 둔" 높이로 접을 때(−)도 같이 맞춘다 — 한쪽만 맞추면 그 차이만큼 남는다.
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
      // 자기 위쪽 끝은 그대로이므로, 바뀌기 전 아래쪽 끝 = top + 이전 높이.
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
