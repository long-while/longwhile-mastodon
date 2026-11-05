import { performHardReload } from '../reload_manager';

describe('reload_manager', () => {
  const originalWindow = global.window;
  const originalLocation = global.location;
  const originalSessionStorage = global.sessionStorage;

  let replace: ReturnType<typeof vi.fn>;
  let reload: ReturnType<typeof vi.fn>;
  let setItem: ReturnType<typeof vi.fn>;
  let store: Map<string, string>;

  beforeEach(() => {
    let href = 'http://localhost/';

    replace = vi.fn();
    reload = vi.fn();

    const locationMock: Partial<Location> = {
      get href() {
        return href;
      },
      set href(value: string) {
        href = value;
      },
      origin: 'http://localhost',
      pathname: '/',
      search: '',
      hash: '',
      replace,
      reload,
    };

    store = new Map<string, string>();
    setItem = vi.fn((key: string, value: string) => {
      store.set(key, value);
    });

    const sessionStorageMock = {
      getItem: vi.fn((key: string) => store.get(key) ?? null),
      setItem,
      removeItem: vi.fn((key: string) => {
        store.delete(key);
      }),
    };

    Object.defineProperty(global, 'window', {
      value: {
        location: locationMock,
        setTimeout: vi.fn((cb: () => void) => {
          cb();
        }),
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

    expect(setItem).toHaveBeenCalledWith('_multiAccountReloadCount', '1');
    expect(replace).toHaveBeenCalledWith('/foobar');
    expect(reload).toHaveBeenCalled();
  });

  it('aborts when exceeding maximum reload attempts', () => {
    store.set('_multiAccountReloadCount', '2');

    performHardReload('/foobar');

    expect(replace).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });
});
