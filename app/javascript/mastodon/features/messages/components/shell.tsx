// @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
//   메시지 전용 레이아웃 셸.
//
//   마스토돈의 columns-area__panels 는 좌우 패널의 __inner 가 position: fixed 이고
//   가운데만 문서 스크롤을 따라가는 전제로 만들어져 있다. 그 위에 패널별 독립
//   스크롤을 얹으면 다른 라우트가 깨진다. 그래서 이 화면에 있는 동안만
//   `body.layout-messages` 를 켜고, 그 클래스 아래에서만 규칙을 덮는다.
//   구체적인 내용은 components.scss 의 같은 이름 블록에 적어 두었다.
//
//   **패널을 언마운트하지 않고 CSS 로 감추는 이유**가 있다. 작성창 패널을 실제로
//   지우면 마스토돈의 전역 작성 상태(compose 리듀서)가 함께 사라져, 이 화면에
//   들어왔다 나가면 쓰던 툿 초안이 날아간다.

import { useEffect } from 'react';

const BODY_CLASS = 'layout-messages';

// 대화방을 **열어 둔 동안**만 켜지는 클래스. 모바일에서 화면 아래 고정된
// 내비게이션 바(`.ui__navigation-bar`)를 감추는 데 쓴다.
//
//   그 바는 `position: fixed; bottom: 0` 이라 입력창 위에 그대로 얹힌다.
//   자리를 비워주는(padding-bottom) 대신 감추는 쪽을 골랐다 — 채팅은 입력창이
//   화면 맨 아래에 붙어 있는 것이 기본이고, 방에서 나가는 길은 헤더의 뒤로
//   가기가 이미 맡고 있다.
//
//   **셸이 아니라 방을 기준으로 한다.** `/messages` 목록 화면에서까지 감추면
//   거기서는 나갈 방법이 없어진다.
const ROOM_BODY_CLASS = 'layout-messages-room';

//   enabled 를 받는 이유: 훅은 조건부로 부를 수 없는데, 로그인하지 않았거나
//   기능이 꺼져 있으면 셸을 그리지 않고 안내만 띄운다. 그때까지 레이아웃을 켜면
//   내비가 아이콘 레일로 좁아진 채 안내문만 남는다.
export const useMessagesLayout = (enabled: boolean, roomOpen = false) => {
  useEffect(() => {
    if (!enabled) return undefined;

    document.body.classList.add(BODY_CLASS);

    return () => {
      document.body.classList.remove(BODY_CLASS);
    };
  }, [enabled]);

  // 이펙트를 나눈다. 한 이펙트에서 둘을 다루면 방을 여닫을 때마다
  // `layout-messages` 까지 떨어졌다 붙어, 그때마다 문서 스크롤과 높이가
  // 한 프레임씩 되돌아간다.
  useEffect(() => {
    if (!enabled || !roomOpen) return undefined;

    document.body.classList.add(ROOM_BODY_CLASS);

    return () => {
      document.body.classList.remove(ROOM_BODY_CLASS);
    };
  }, [enabled, roomOpen]);
};
