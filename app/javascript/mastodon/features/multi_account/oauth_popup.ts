
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
  }
};

export const openBlankOAuthPopup = (loadingText: string): Window | null => {
  const popup = window.open('about:blank', OAUTH_POPUP_NAME, popupFeatures());

  if (popup) writeLoadingPage(popup, loadingText);

  return popup;
};

export const closeBlankOAuthPopup = (popup: Window | null): void => {
  if (!popup || popup.closed) return;

  try {
    if (popup.location.href === 'about:blank') popup.close();
  } catch {
  }
};

export const isIosHomeScreenApp = (): boolean =>
  (navigator as Navigator & { standalone?: boolean }).standalone === true;
