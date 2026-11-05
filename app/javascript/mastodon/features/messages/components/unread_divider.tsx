// @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
//   "여기까지 읽음" 구분선. FR-17, 기획서 §4.3.6
//
//   서버가 방 응답에 last_read_status_id 를 담아준다. 방을 열면 곧바로 읽음으로
//   기록되므로(room.tsx 의 markDmRoomRead), 그 값을 매번 다시 읽으면 구분선이
//   그려지자마자 사라진다. 방에 들어온 순간의 값을 한 번만 잡아 두고 머무는 동안
//   유지한다 — 어디까지 읽었는지는 들어온 순간의 사실이다.

import { defineMessages, FormattedMessage, useIntl } from 'react-intl';

const messages = defineMessages({
  label: { id: 'messages.unread_divider', defaultMessage: 'Unread' },
});

export const UnreadDivider: React.FC = () => {
  const intl = useIntl();

  return (
    // role='separator' 는 children 을 접근성 트리에서 지운다(포커스 없는 구분선의
    // 이름은 author 지정만 허용). aria-label 을 주지 않으면 안의 글자가 아예 안
    // 읽혀 FR-17 이 스크린 리더에서만 무효가 된다.
    <div
      className='dm-unread-divider'
      role='separator'
      aria-label={intl.formatMessage(messages.label)}
    >
      <span className='dm-unread-divider__label'>
        <FormattedMessage id='messages.unread_divider' defaultMessage='Unread' />
      </span>
    </div>
  );
};
