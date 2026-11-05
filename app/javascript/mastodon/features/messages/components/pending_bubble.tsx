// @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
//   아직 서버에 없는 내 메시지. 전송 버튼을 누른 순간 그려진다.
//   근거: dm-chat-phase-3.md §3.1~3.3, 기획서 §4.3.6

import { useCallback } from 'react';

import { defineMessages, FormattedMessage, useIntl } from 'react-intl';

import classNames from 'classnames';

import WarningIcon from '@/material-icons/400-24px/warning.svg?react';
import { Icon } from 'mastodon/components/icon';
import type { PendingDmMessage } from 'mastodon/reducers/dm_messages';

const messages = defineMessages({
  sending: { id: 'messages.pending.sending', defaultMessage: 'Sending…' },
  failed: { id: 'messages.pending.failed', defaultMessage: 'Not sent' },
  // 재시도해도 소용없다는 것이 전달돼야 한다. 일반 실패와 문구를 나눈다. (US-10)
  rateLimited: {
    id: 'messages.pending.rate_limited',
    defaultMessage: 'Too many messages. Try again in a little while.',
  },
  retry: { id: 'messages.pending.retry', defaultMessage: 'Try again' },
  discard: { id: 'messages.pending.discard', defaultMessage: 'Delete' },
});

interface Props {
  pending: PendingDmMessage;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;

  // 덩어리가 **발신자 전환**으로 시작했는지. 여백만 가른다(§group_messages.ts).
  isSenderChanged: boolean;
  onRetry: (localId: string) => void;
  onDiscard: (localId: string) => void;
}

export const PendingBubble: React.FC<Props> = ({
  pending,
  isFirstInGroup,
  isLastInGroup,
  isSenderChanged,
  onRetry,
  onDiscard,
}) => {
  const intl = useIntl();

  const handleRetry = useCallback(() => {
    onRetry(pending.localId);
  }, [onRetry, pending.localId]);

  const handleDiscard = useCallback(() => {
    onDiscard(pending.localId);
  }, [onDiscard, pending.localId]);

  const failed = pending.state === 'failed';
  const mediaCount = pending.mediaIds?.length ?? 0;

  return (
    <div
      className={classNames('dm-message', 'dm-message--mine', {
        'dm-message--first': isFirstInGroup,
        'dm-message--last': isLastInGroup,
        'dm-message--sender-changed': isSenderChanged,
        'dm-message--pending': !failed,
        'dm-message--failed': failed,
      })}
    >
      {/* 상태를 색과 아이콘으로만 구분하지 않는다. 스크린 리더는 이 줄을 먼저
          읽는다. (기획서 §4.7) */}
      <span className='dm-message__sr-label'>
        {intl.formatMessage(failed ? messages.failed : messages.sending)}
      </span>

      <div className='dm-message__body'>
        {pending.text.trim() !== '' && (
          <div className='dm-message__bubble'>{pending.text}</div>
        )}

        {/* 첨부는 개수만 알린다. 미리보기 URL 의 수명 문제는 리듀서 주석 참조. */}
        {mediaCount > 0 && (
          <div className='dm-message__pending-media'>
            <FormattedMessage
              id='messages.pending.attachments'
              defaultMessage='{count, plural, other {# attachments}}'
              values={{ count: mediaCount }}
            />
          </div>
        )}

        <div
          className={classNames('dm-message__state', {
            'dm-message__state--failed': failed,
          })}
        >
          {failed ? (
            <>
              <Icon id='exclamation-circle' icon={WarningIcon} />

              <span>
                {intl.formatMessage(
                  pending.rateLimited ? messages.rateLimited : messages.failed,
                )}
              </span>

              {/* 재시도는 같은 멱등성 키로 나간다. 첫 요청이 사실은 성공했더라도
                  서버가 기존 글을 돌려주므로 중복이 생기지 않는다. (§3.4) */}
              <button type='button' onClick={handleRetry}>
                {intl.formatMessage(messages.retry)}
              </button>

              <button type='button' onClick={handleDiscard}>
                {intl.formatMessage(messages.discard)}
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};
