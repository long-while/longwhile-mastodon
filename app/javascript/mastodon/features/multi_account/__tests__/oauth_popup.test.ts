import {
  OAUTH_POPUP_NAME,
  closeBlankOAuthPopup,
  isIosHomeScreenApp,
  openBlankOAuthPopup,
} from '../oauth_popup';

const fakePopup = (href: string) => {
  const doc = document.implementation.createHTMLDocument('');

  return {
    closed: false,
    close: vi.fn(),
    location: { href },
    document: doc,
  } as unknown as Window & { close: ReturnType<typeof vi.fn> };
};

describe('oauth_popup', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens the popup synchronously and shows a loading line', () => {
    const popup = fakePopup('about:blank');
    const open = vi.spyOn(window, 'open').mockReturnValue(popup);

    const result = openBlankOAuthPopup('Loading…');

    expect(result).toBe(popup);
    expect(open).toHaveBeenCalledWith(
      'about:blank',
      OAUTH_POPUP_NAME,
      expect.stringContaining('width=600'),
    );
    expect(popup.document.body.textContent).toBe('Loading…');
  });

  it('returns null when the browser blocks it', () => {
    vi.spyOn(window, 'open').mockReturnValue(null);

    expect(openBlankOAuthPopup('Loading…')).toBeNull();
  });

  it('closes a popup that never left the loading page', () => {
    const popup = fakePopup('about:blank');

    closeBlankOAuthPopup(popup);

    expect(popup.close).toHaveBeenCalled();
  });

  it('leaves a popup alone once the login screen is showing', () => {
    const popup = fakePopup('https://example.com/oauth/authorize?prompt=login');

    closeBlankOAuthPopup(popup);

    expect(popup.close).not.toHaveBeenCalled();
  });

  it('ignores a missing popup', () => {
    expect(() => {
      closeBlankOAuthPopup(null);
    }).not.toThrow();
  });

  it('recognises the iOS Home Screen app only', () => {
    const nav = navigator as Navigator & { standalone?: boolean };

    Object.defineProperty(nav, 'standalone', {
      value: true,
      configurable: true,
    });
    expect(isIosHomeScreenApp()).toBe(true);

    Object.defineProperty(nav, 'standalone', {
      value: undefined,
      configurable: true,
    });
    expect(isIosHomeScreenApp()).toBe(false);
  });
});
