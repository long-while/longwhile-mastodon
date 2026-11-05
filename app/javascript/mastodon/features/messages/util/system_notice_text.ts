// @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
//   방 안내문(제목 변경·멤버 변경)에서 사람에게 보일 문장만 꺼낸다.

import { unescapeHTML } from 'mastodon/utils/html';

import { stripLeadingMentions } from './strip_leading_mentions';

// 본문 앞의 핸들(`@alice @bob …`)은 떼고 문장만 남긴다. 서버가 방 참여자 전원을
// 멘션해 둔 것은 **다른 접속에 이 이벤트를 배달하기 위해서**다(DmRoom 의
// post_member_event!). 사람에게 보일 내용이 아니다 — 그대로 두면 "@alice @bob
// @carol 운영자 님이 …" 처럼 문장 앞에 핸들이 줄줄이 붙는다.
//
// 평문으로 바꾼 뒤에 뗀다. 안내문은 HTML 로 그리지 않으므로(system_notice.tsx)
// h-card 노드를 따질 필요가 없다.
export const systemNoticeText = (contentHtml: string | undefined | null) => {
  // unescapeHTML 의 반환 타입이 nullable 로 선언돼 있다. 빈 문자열로 떨어뜨린다.
  const text = (contentHtml ? unescapeHTML(contentHtml) : '') ?? '';

  return stripLeadingMentions(text.trim()).trim();
};
