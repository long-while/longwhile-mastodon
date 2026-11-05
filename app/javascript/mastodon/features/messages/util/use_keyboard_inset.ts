// @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
//   모바일 가상 키보드가 입력창을 가리는 문제. 기획서 §11 반응형
//
//   가상 키보드가 올라오면 **visual viewport** 만 줄어들고 layout viewport 는
//   그대로다. 그래서 화면 아래에 붙여둔 입력창이 키보드 뒤로 들어간다. 채팅에서
//   이건 치명적이다 — 글을 치는 동안 자기가 뭘 쳤는지 못 본다.
//
//   레이아웃 자체를 dvh 로 바꾸는 방법도 있지만 그건 앱 전체의 뷰포트 규칙을
//   건드린다. 여기서는 가려진 높이만 재서 이 화면에만 준다.

import { useEffect, useState } from 'react';

// 이보다 작은 차이는 키보드가 아니다. 모바일 브라우저의 주소창이 접히고 펴질 때
// 수십 픽셀이 오간다. 그것까지 따라가면 스크롤할 때마다 입력창이 들썩인다.
const KEYBOARD_MIN_HEIGHT = 100;

export const useKeyboardInset = () => {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const viewport = window.visualViewport;

    if (!viewport) return undefined;

    const update = () => {
      // 핀치 줌을 키보드로 오인하지 않는다. 2배로 확대하면 viewport.height 가
      // 절반이 되어 화면 높이의 절반이 "가려졌다" 로 잡히고, 저시력 사용자에게는
      // 입력창 아래에 거대한 빈칸이 생긴다.
      if (viewport.scale > 1.01) {
        setInset(0);
        return;
      }

      const overlap =
        window.innerHeight - (viewport.height + viewport.offsetTop);

      setInset(overlap > KEYBOARD_MIN_HEIGHT ? Math.round(overlap) : 0);
    };

    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);

    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
    };
  }, []);

  return inset;
};
