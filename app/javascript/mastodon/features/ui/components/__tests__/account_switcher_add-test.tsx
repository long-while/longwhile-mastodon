import { IntlProvider } from 'react-intl';

import { fromJS } from 'immutable';
import { Provider } from 'react-redux';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { AccountSwitcher } from '../account_switcher';

// 흐름이 부르는 다중 계정 API·팝업 모듈은 컴포넌트가 `import()` 로 늦게
// 불러서 모듈 단위로는 가짜를 끼우기 어렵다. 그 아래의 HTTP(`mastodon/api`)를
// 가짜로 두고, 실제 모듈을 그대로 거치게 한다.
const http = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  suspendSessionRecovery: vi.fn(),
}));

vi.mock('mastodon/api', () => ({
  default: () => ({ get: http.get, post: http.post }),
  suspendSessionRecovery: http.suspendSessionRecovery,
}));

vi.mock('mastodon/utils/multi_account_db', () => ({
  clearAllAccounts: () => Promise.resolve(),
  loadAllEntries: () => Promise.resolve([]),
  loadEncryptedToken: () => Promise.resolve(null),
}));

vi.mock('mastodon/utils/log_out', () => ({ logOut: () => Promise.resolve() }));

const REFRESH_TOKEN_URL = '/api/v1/multi_accounts/refresh_token';
const RESTORE_URL = '/multi_accounts/session/restore';
const ENTRY = { authorize_url: '/oauth/authorize?x', state: 's', nonce: 'n' };

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((_resolve) => {
    resolve = _resolve;
  });
  return { promise, resolve };
};

// 실제 앱의 계정은 레코드라 `.id` 로 읽힌다. 맵이 아니라 객체로 둔다.
const state = fromJS({
  meta: { me: '1' },
  accounts: {},
  multiAccount: {},
}).setIn(['accounts', '1'], {
  id: '1',
  acct: 'me',
  username: 'me',
  display_name: 'Me',
});

const dispatched: { type?: string }[] = [];

const fakeStore = {
  getState: () => state,
  subscribe: () => () => undefined,
  dispatch: (action: unknown) => {
    if (typeof action === 'function') return Promise.resolve();
    dispatched.push(action as { type?: string });
    return action;
  },
};

const alerts = () => dispatched.filter((a) => a.type === 'alerts/show');

const fakePopup = () =>
  ({
    closed: false,
    close: vi.fn(function (this: { closed: boolean }) {
      this.closed = true;
    }),
    location: { href: 'about:blank' },
    document: document.implementation.createHTMLDocument(''),
  }) as unknown as Window & { close: ReturnType<typeof vi.fn> };

const renderTrigger = ({ openManage }: { openManage: () => void }) => (
  <button type='button' onClick={openManage}>
    manage
  </button>
);

const renderSwitcher = () => {
  render(
    <Provider store={fakeStore as never}>
      <IntlProvider locale='en'>
        <AccountSwitcher renderTrigger={renderTrigger} />
      </IntlProvider>
    </Provider>,
  );
  fireEvent.click(screen.getByText('manage'));
};

const clickAdd = () => {
  fireEvent.click(screen.getByText('Add an existing account'));
};

// 흐름이 준비 단계(토큰 발급·인가 주소 받기를 함께 기다리는 곳)에 들어갔다.
const waitUntilPreparing = () =>
  vi.waitFor(() => {
    expect(
      http.post.mock.calls.some(([url]) => url === REFRESH_TOKEN_URL),
    ).toBe(true);
  });

const settle = (fn: () => void) =>
  act(async () => {
    fn();
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

const restoreCalls = () =>
  http.post.mock.calls.filter(([url]) => url === RESTORE_URL);

// 엄격 모드에서 배열 칸은 `undefined` 일 수 있으므로 꺼낼 때 확인한다.
const nth = <T,>(items: T[], index: number): T => {
  const item = items[index];
  if (item === undefined) throw new Error(`no item at ${index}`);
  return item;
};

let mintResponses: {
  promise: Promise<unknown>;
  resolve: (v: unknown) => void;
}[];

beforeEach(() => {
  dispatched.length = 0;
  mintResponses = [];
  http.get.mockReset();
  http.post.mockReset();
  http.suspendSessionRecovery.mockReset();
  http.suspendSessionRecovery.mockImplementation(() => () => undefined);

  http.get.mockImplementation((url: string) =>
    Promise.resolve(url === '/multi_accounts/entry' ? { data: ENTRY } : {}),
  );
  http.post.mockImplementation((url: string) => {
    if (url !== REFRESH_TOKEN_URL) return Promise.resolve({});
    const response = deferred<unknown>();
    mintResponses.push(response);
    return response.promise;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('<AccountSwitcher /> adding an account', () => {
  it('opens the popup in the same tick as the tap (iOS Safari)', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(fakePopup());

    renderSwitcher();
    clickAdd();

    // 아무 Promise 도 풀기 전에 이미 열려 있어야 한다.
    expect(open).toHaveBeenCalledTimes(1);
    expect(open.mock.calls[0]?.[0]).toBe('about:blank');

    // 흐름을 끝내 둔다. 안 그러면 늦게 나가는 토큰 요청이 다음 테스트의
    // 응답 목록에 섞인다.
    await waitUntilPreparing();
    fireEvent.click(screen.getByText('Cancel'));
  });

  it('stops with a message when the popup is blocked', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);

    renderSwitcher();
    await settle(clickAdd);

    expect(http.post).not.toHaveBeenCalled();
    expect(alerts()).toHaveLength(1);
  });

  it('cancelling while preparing stays quiet and does not disturb the next attempt', async () => {
    const firstPopup = fakePopup();
    vi.spyOn(window, 'open')
      .mockReturnValueOnce(firstPopup)
      .mockReturnValueOnce(fakePopup());

    renderSwitcher();
    clickAdd();
    await waitUntilPreparing();
    fireEvent.click(screen.getByText('Cancel'));
    expect(firstPopup.close).toHaveBeenCalled();

    // 다시 시작했다. 아직 준비 중이라 "취소" 단추가 보여야 한다.
    await settle(clickAdd);

    // 앞의 흐름의 토큰 발급이 이제야 끝난다.
    await settle(() => {
      nth(mintResponses, 0).resolve({ data: {} });
    });

    expect(alerts()).toHaveLength(0);
    expect(screen.getByText('Cancel')).toBeTruthy();
    expect(restoreCalls()).toHaveLength(0);
    expect(http.suspendSessionRecovery).not.toHaveBeenCalled();
  });

  it('does not log anyone out when the popup was closed while preparing', async () => {
    const popup = fakePopup();
    vi.spyOn(window, 'open').mockReturnValue(popup);

    renderSwitcher();
    clickAdd();
    await waitUntilPreparing();

    (popup as { closed: boolean }).closed = true;
    await settle(() => {
      nth(mintResponses, 0).resolve({ data: {} });
    });

    // 로그인 화면으로 넘기지 않았고(공유 세션의 로그아웃이 없었다), 그러니
    // 되살릴 세션도 없다.
    expect(popup.location.href).toBe('about:blank');
    expect(http.suspendSessionRecovery).not.toHaveBeenCalled();
    expect(restoreCalls()).toHaveLength(0);
    expect(screen.getByText('Add an existing account')).toBeTruthy();
  });

  it('refuses up front inside the iOS Home Screen app', async () => {
    Object.defineProperty(navigator, 'standalone', {
      value: true,
      configurable: true,
    });
    const open = vi.spyOn(window, 'open');

    try {
      renderSwitcher();
      await settle(clickAdd);

      expect(open).not.toHaveBeenCalled();
      expect(alerts()).toHaveLength(1);
    } finally {
      Object.defineProperty(navigator, 'standalone', {
        value: undefined,
        configurable: true,
      });
    }
  });
});
