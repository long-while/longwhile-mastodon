// @_longwhile — 계정 추가 팝업은 **탭한 그 순간에** 빈 창으로 연다.
//
//   iOS 사파리(와 대부분의 모바일 브라우저)는 사용자의 탭과 같은 동기 흐름에서
//   부른 `window.open` 만 허용한다. 예전에는 장기 토큰 발급·모듈 로딩을 `await`
//   한 **뒤에** 열어서, 데스크톱 크롬(클릭 뒤 몇 초는 봐준다)에서는 되고 iOS
//   에서는 `null` 이 돌아와 "팝업이 차단되었습니다" 로만 끝났다.
//
//   그래서 빈 창을 먼저 열어 두고, 준비가 끝나면 그 창의 주소를 인가 화면으로
//   바꾼다(`openOAuthPopup(…, existingPopup)`). 준비하는 동안 빈 흰 창만 보이면
//   멈춘 것처럼 보이므로 "불러오는 중" 한 줄을 써 둔다.

export const OAUTH_POPUP_NAME = 'multi-account-oauth';

const POPUP_WIDTH = 600;
const POPUP_HEIGHT = 700;

const popupFeatures = (): string => {
  const left = window.screenX + (window.outerWidth - POPUP_WIDTH) / 2;
  const top = window.screenY + (window.outerHeight - POPUP_HEIGHT) / 2;

  return `width=${POPUP_WIDTH},height=${POPUP_HEIGHT},left=${left},top=${top},toolbar=no,menubar=no,location=no`;
};

const writeLoadingPage = (popup: Window, loadingText: string): void => {
  try {
    const doc = popup.document;
    doc.title = loadingText;
    doc.body.style.cssText =
      'margin:0;display:flex;align-items:center;justify-content:center;' +
      'min-height:100vh;font:16px system-ui,sans-serif;color:#666;';
    doc.body.textContent = loadingText;
  } catch {
    // 빈 창에 글을 못 쓰는 브라우저도 있다. 흐름에는 지장이 없다.
  }
};

// 반드시 클릭/탭 핸들러 안에서 **`await` 전에** 부를 것.
export const openBlankOAuthPopup = (loadingText: string): Window | null => {
  const popup = window.open('about:blank', OAUTH_POPUP_NAME, popupFeatures());

  if (popup) writeLoadingPage(popup, loadingText);

  return popup;
};

// 아직 인가 화면으로 넘어가지 않은 빈 창이면 닫는다. 이미 로그인 화면이
// 떠 있으면 건드리지 않는다 — 사용자가 입력 중일 수 있다.
export const closeBlankOAuthPopup = (popup: Window | null): void => {
  if (!popup || popup.closed) return;

  try {
    if (popup.location.href === 'about:blank') popup.close();
  } catch {
    // 다른 출처로 넘어갔으면 읽을 수 없다. 그건 빈 창이 아니다.
  }
};

// iOS 에서 "홈 화면에 추가" 한 웹앱으로 열려 있는지. 이 속성은 iOS 에만 있다.
//
//   그 웹앱은 사파리와 쿠키·저장소가 **분리**돼 있다. 팝업은 사파리 쪽 창으로
//   열리므로, 거기서 로그인한 세션도, 계정 목록(IndexedDB)도 이 앱과 이어지지
//   않는다. 사용자는 로그인까지 해 놓고 90초 뒤 시간 초과만 보게 된다. 그래서
//   팝업을 열기 전에 막고 이유를 알린다. 안드로이드의 설치형 앱은 브라우저와
//   저장소를 함께 쓰므로 막지 않는다.
export const isIosHomeScreenApp = (): boolean =>
  (navigator as Navigator & { standalone?: boolean }).standalone === true;
