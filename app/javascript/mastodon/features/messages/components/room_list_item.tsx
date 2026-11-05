// @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅

import { useMemo } from 'react';

import { defineMessages, useIntl } from 'react-intl';

import classNames from 'classnames';
import { Link } from 'react-router-dom';

import type { ApiDmRoomJSON } from 'mastodon/api_types/dm_rooms';

import { previewText } from '../util/preview_text';
import { relativeTimeLabel } from '../util/relative_time';

import { RoomAvatar } from './room_avatar';

const messages = defineMessages({
  photo: { id: 'messages.preview.photo', defaultMessage: 'Photo' },
  video: { id: 'messages.preview.video', defaultMessage: 'Video' },
  audio: { id: 'messages.preview.audio', defaultMessage: 'Audio' },
  file: { id: 'messages.preview.file', defaultMessage: 'Attachment' },
  empty: { id: 'messages.preview.empty', defaultMessage: 'No messages yet' },
  contentWarning: {
    id: 'messages.preview.content_warning',
    defaultMessage: 'Content warning: {warning}',
  },
  fromMe: { id: 'messages.preview.from_me', defaultMessage: 'You: {body}' },
  draft: { id: 'messages.preview.draft', defaultMessage: 'Draft: {body}' },
});

interface Props {
  room: ApiDmRoomJSON;
  myAccountId: string;
  isActive?: boolean;
  draft?: string;

  // 링크 목적지를 바꿔 끼운다. 운영진 화면(/messages/all)이 같은 카드를 쓰되
  // 다른 경로로 보내야 하기 때문이다. 주지 않으면 평소대로 내 대화방으로 간다.
  to?: string;
}

// 나가기 버튼을 두지 않는다. 카드 전체가 방으로 들어가는 링크인데 그 안에 **다른
// 일을 하는 버튼**이 겹쳐 있으면 목록을 훑다가 잘못 누른다. 되돌릴 수 없는 동작이
// 목록에 노출될 자리가 아니다. 나가기는 방 안 헤더의 ⋯ 메뉴에 있다
// (components/room_header.tsx).
export const RoomListItem: React.FC<Props> = ({
  room,
  myAccountId,
  isActive = false,
  draft,
  to,
}) => {
  const intl = useIntl();

  // 상대 계정을 여기서 읽던 자리가 있었다. 아바타가 `RoomAvatar` 로 옮겨가면서
  // 쓰이지 않게 됐고(그쪽이 스토어에서 직접 읽는다) 값만 남아 있었다 — 방마다
  // 스토어 구독이 하나씩 더 걸려 있었던 셈이다. 함께 걷는다.
  const memberIds = useMemo(
    () => room.accounts.map((entry) => entry.id),
    [room.accounts],
  );

  const title =
    room.title ??
    room.accounts
        .map((entry) => entry.display_name || entry.username)
        .join(', ');

  const last = room.last_status;

  const preview = previewText(
    last
      ? {
          content: last.content ?? '',
          spoilerText: last.spoiler_text ?? '',
          mediaTypes: last.media_attachments.map((media) => media.type),
          isMine: last.account.id === myAccountId,
        }
      : null,
    {
      photo: intl.formatMessage(messages.photo),
      video: intl.formatMessage(messages.video),
      audio: intl.formatMessage(messages.audio),
      file: intl.formatMessage(messages.file),
      empty: intl.formatMessage(messages.empty),
      contentWarning: (warning) =>
        intl.formatMessage(messages.contentWarning, { warning }),
      fromMe: (body) => intl.formatMessage(messages.fromMe, { body }),
      draft: (body) => intl.formatMessage(messages.draft, { body }),
    },
    draft,
  );

  const unread = room.unread_count > 0;

  return (
    <Link
      to={to ?? `/messages/${room.id}`}
      className={classNames('dm-room-item', {
        'dm-room-item--active': isActive,
        'dm-room-item--unread': unread,

        // 미리보기가 마지막 메시지가 아니라 **내가 쓰다 만 글**이라는 표시.
        // 색만 다르게 하는 것이 아니라 문구도 "초안: " 으로 다르다 — 색은
        // 거들 뿐이다(기획서 §4.7, 색만으로 구분하지 않는다).
        'dm-room-item--draft': Boolean(draft?.trim()),
      })}
    >
      {/* 그룹 배지를 뺐다(2026-08-13 요청). 얼굴이 둘 겹쳐 있는 것으로 이미
          여럿이라는 것이 보인다(room_avatar.tsx) — 그 위에 아이콘을 하나 더
          얹으면 48px 안에 그림이 셋이 된다. */}
      <div className='dm-room-item__avatar'>
        <RoomAvatar accountIds={memberIds} size={48} />
      </div>

      <div className='dm-room-item__body'>
        <div className='dm-room-item__line'>
          <span className='dm-room-item__title'>{title}</span>
          {/* 시각 영역의 폭을 고정해 이름 길이와 무관하게 정렬을 맞춘다. */}
          <span className='dm-room-item__time'>
            {last ? relativeTimeLabel(intl, last.created_at) : ''}
          </span>
        </div>

        <div className='dm-room-item__line'>
          <span className='dm-room-item__preview'>{preview}</span>
          {unread && (
            <span className='dm-room-item__badge'>{room.unread_count}</span>
          )}
        </div>
      </div>
    </Link>
  );
};
