// @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
//   대화 시작 지점에 놓는 안내.
//
//   두 가지를 한다.
//
//   1. **대화의 시작이 어디인지 알려준다.** 이게 없으면 위로 끝까지 올렸을 때
//      더 있는지 없는지 알 수 없다. 로딩이 끝난 것과 이력이 없는 것이 구분되지
//      않는다.
//   2. **운영진이 전부 볼 수 있다는 사실을 알린다.** 이 서버의 DM 은 운영 화면
//      (/messages/all)에서 읽기 전용으로 열람된다. 그것을 모른 채 비밀번호나
//      개인정보를 주고받는 일이 없어야 한다.
//
//   전에는 상대의 아바타·이름·핸들·팔로워 수와 "프로필 보기" 단추를 함께 뒀는데
//   전부 뺐다. 그 정보는 헤더와 프로필에 이미 있다.

import { FormattedMessage } from 'react-intl';

export const RoomIntro: React.FC = () => (
  <div className='dm-room-intro'>
    <p className='dm-room-intro__notice'>
      <FormattedMessage
        id='messages.intro.notice'
        defaultMessage='All messages on this server can be read by moderators. Please avoid sending anything sensitive.'
      />
    </p>
  </div>
);
