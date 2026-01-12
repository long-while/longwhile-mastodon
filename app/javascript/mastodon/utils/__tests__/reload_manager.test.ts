import { performHardReload } from '../reload_manager';

describe('reload_manager', () => {
  const originalWindow = global.window;
  const originalLocation = global.location;
  const originalSessionStorage = global.sessionStorage;

  beforeEach(() => {
    let href = 'http://localhost/';

    const locationMock: Partial<Location> = {
      get href() {
        return href;
      },
      set href(value: string) {
        href = value;
      },
      pathname: '/',
      search: '',
      hash: '',
      replace: jest.fn(),
      reload: jest.fn(),
    };

    const sessionStorageMock = (() => {
      const store = new Map<string, string>();
      return {
        getItem: jest.fn((key: string) => store.get(key) ?? null),
        setItem: jest.fn((key: string, value: string) => {
          store.set(key, value);
        }),
        removeItem: jest.fn((key: string) => {
          store.delete(key);
        }),
      };
    })();

    Object.defineProperty(global, 'window', {
      value: {
        location: locationMock,
        setTimeout: jest.fn((cb: () => void) => cb()),
      },
      configurable: true,
    });

    Object.defineProperty(global, 'location', {
      value: locationMock,
      configurable: true,
    });

    Object.defineProperty(global, 'sessionStorage', {
      value: sessionStorageMock,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(global, 'window', {
      value: originalWindow,
      configurable: true,
    });
    Object.defineProperty(global, 'location', {
      value: originalLocation,
      configurable: true,
    });
    Object.defineProperty(global, 'sessionStorage', {
      value: originalSessionStorage,
      configurable: true,
    });
  });

  it('updates reload counter and triggers replace/reload', () => {
    performHardReload('/foobar');

    expect(global.sessionStorage.setItem).toHaveBeenCalledWith(
      '_multiAccountReloadCount',
      '1',
    );
    expect(global.location.replace).toHaveBeenCalledWith('/foobar');
    expect(global.location.reload).toHaveBeenCalled();
  });

  it('aborts when exceeding maximum reload attempts', () => {
    global.sessionStorage.setItem('_multiAccountReloadCount', '2');

    performHardReload('/foobar');

    expect(global.location.replace).not.toHaveBeenCalled();
    expect(global.location.reload).not.toHaveBeenCalled();
  });
});

