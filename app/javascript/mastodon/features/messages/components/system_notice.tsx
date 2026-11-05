// @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
//   방에서 일어난 일(제목 변경·멤버 변경)을 알리는 가운데 정렬 안내문.
//   근거: docs/dm-chat/phases/dm-chat-phase-5.md §3.2
//
//   **말풍선이 아니다.** 누가 보낸 말이 아니라 방에 일어난 일이라, 좌우로 치우치면
//   그것을 누군가의 발언으로 읽게 된다.
//
//   본문을 평문으로 꺼내 쓴다. 서버가 넣은 문장이고 사용자 입력이 섞이는 곳은
//   제목뿐인데, 그 제목은 status 본문으로 들어오면서 이미 마스토돈의 정화를
//   거쳤다. 그래도 HTML 을 그리지 않는 이유는 이 줄에 링크나 멘션이 있을 이유가
//   없기 때문이다 — 그릴 수 있게 두면 언젠가 들어온다.

import { systemNoticeText } from '../util/system_notice_text';

interface Props {
  // 안내문 본문 HTML. 서버가 만든 문장이다.
  contentHtml?: string;
}

export const SystemNotice: React.FC<Props> = ({ contentHtml }) => {
  // 앞에 붙은 수신자 핸들은 여기서 뗀다(util/system_notice_text.ts).
  const text = systemNoticeText(contentHtml);

  // 본문이 비면 그리지 않는다. 빈 줄만 남으면 여백이 이유 없이 생긴다.
  if (!text) return null;

  return (
    <div className='dm-system-notice' role='status'>
      {text}
    </div>
  );
};
