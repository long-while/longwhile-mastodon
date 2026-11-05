// @_longwhile custom feature / 한참(longwhile) 제작 기능 — DM 채팅
//   전송 키가 화면에 따라 갈린다. 근거: 기획서 4.4.2, OI-09 (DECISIONS A-17)
//
//     PC 뷰        Enter = 전송,  Shift+Enter = 줄바꿈
//     모바일·탭    Enter = 줄바꿈, Ctrl/⌘+Enter = 전송
//
//   좁은 화면에서 Enter 를 전송으로 두면 줄을 바꿀 방법이 사실상 없다. 가상
//   키보드에는 Shift 를 누른 채 Enter 를 치는 동작이 마땅치 않고, 화면 키보드의
//   ↵ 는 사용자가 줄바꿈으로 읽는다.

import { useEffect, useState } from 'react';

// **`$dm-three-column-breakpoint` 와 같은 값이어야 한다.** 3열이 성립하는 폭이
// 곧 PC 뷰다. 그 변수는 `_variables.scss` 의 `$no-gap-breakpoint`(1175px)를
// 그대로 받고, `components.scss` 의 `.dm-shell` 반응형이 그것으로 판정한다.
//
//   grep -n 'no-gap-breakpoint' app/javascript/styles/mastodon/_variables.scss
//
// 한쪽만 고치면 **2열로 보이는데 Enter 는 전송인 상태**가 된다. 실제로 밟았다 —
// 3열 전환을 1320 → 1175 로 내릴 때(A-25) 이 파일이 1100 에 남아 1100~1174 에서
// 그렇게 됐다. 값을 바꿀 일이 생기면 두 파일을 함께 고친다.
//
// 폭만 보지 않고 `pointer: fine` 을 함께 본다. 가로로 눕힌 태블릿은 그 폭을
// 넘기면서도 입력은 가상 키보드로 한다 — 폭만 보면 그 화면이 PC 로 잡힌다.
const DESKTOP_QUERY = '(min-width: 1175px) and (pointer: fine)';

export const useSendOnEnter = (): boolean => {
  const [matches, setMatches] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia(DESKTOP_QUERY).matches,
  );

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const query = window.matchMedia(DESKTOP_QUERY);

    const handleChange = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    // 마운트 시점에 한 번 맞춘다. 창 크기가 첫 렌더와 이 이펙트 사이에 바뀔 수 있다.
    setMatches(query.matches);
    query.addEventListener('change', handleChange);

    return () => {
      query.removeEventListener('change', handleChange);
    };
  }, []);

  return matches;
};
