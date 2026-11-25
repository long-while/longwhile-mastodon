export const SOCKET_CONNECTING = 0;
export const SOCKET_OPEN = 1;
export const SOCKET_CLOSED = 3;

export const MIN_RETRY_MS = 1_000;
export const MAX_RETRY_MS = 30_000;
export const STALE_AFTER_HIDDEN_MS = 60_000;

const APPLICATION_CLOSE_CODE = 3000;

export const retryDelay = (
  attempt: number,
  random: () => number = Math.random,
) => {
  const ceiling = Math.min(
    MAX_RETRY_MS,
    MIN_RETRY_MS * 2 ** Math.min(attempt, 10),
  );
  return Math.round(ceiling / 2 + (random() * ceiling) / 2);
};

export interface ReconnectingSocketCallbacks {
  onOpen: () => void;
  onMessage: (event: MessageEvent<string>) => void;
  onDown: () => void;
}

type WebSocketFactory = (
  url: string,
  protocols?: string | string[],
) => WebSocket;

export interface ReconnectingSocketOptions {
  createSocket?: WebSocketFactory;
  random?: () => number;
}

const defaultCreateSocket: WebSocketFactory = (url, protocols) =>
  new WebSocket(url, protocols);

export class ReconnectingSocket {
  private socket: WebSocket | null = null;
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private closedByCaller = false;
  private downReported = false;
  private readonly createSocket: WebSocketFactory;
  private readonly random: () => number;

  constructor(
    private readonly url: string,
    private readonly protocols: string | string[] | undefined,
    private readonly callbacks: ReconnectingSocketCallbacks,
    {
      createSocket = defaultCreateSocket,
      random = Math.random,
    }: ReconnectingSocketOptions = {},
  ) {
    this.createSocket = createSocket;
    this.random = random;
    this.connect();
  }

  get readyState(): number {
    return this.socket?.readyState ?? SOCKET_CLOSED;
  }

  send(data: string) {
    if (this.socket?.readyState !== SOCKET_OPEN) return;
    this.socket.send(data);
  }

  close() {
    this.closedByCaller = true;
    this.clearTimer();
    this.dropSocket();
  }

  wake(distrustOpenSocket: boolean) {
    if (this.closedByCaller) return;

    if (this.socket && !distrustOpenSocket) return;

    if (this.socket) {
      this.dropSocket();
      this.reportDown();
    }

    this.clearTimer();
    this.attempt = 0;
    this.connect();
  }

  private connect() {
    let socket: WebSocket;

    try {
      socket = this.createSocket(this.url, this.protocols);
    } catch (error) {
      console.warn('[stream] could not open the streaming socket', error);
      this.reportDown();
      this.scheduleRetry();
      return;
    }

    this.socket = socket;

    socket.onopen = () => {
      this.attempt = 0;
      this.downReported = false;
      this.callbacks.onOpen();
    };

    socket.onmessage = (event: MessageEvent<string>) => {
      this.callbacks.onMessage(event);
    };

    socket.onclose = (event: CloseEvent) => {
      if (this.socket !== socket) return;

      this.socket = null;
      this.reportDown();

      if (this.closedByCaller || event.code >= APPLICATION_CLOSE_CODE) return;

      this.scheduleRetry();
    };
  }

  private scheduleRetry() {
    this.clearTimer();
    this.timer = setTimeout(
      () => {
        this.timer = null;
        this.connect();
      },
      retryDelay(this.attempt, this.random),
    );
    this.attempt += 1;
  }

  private reportDown() {
    if (this.downReported) return;

    this.downReported = true;
    this.callbacks.onDown();
  }

  private dropSocket() {
    const socket = this.socket;

    if (!socket) return;

    this.socket = null;
    socket.onopen = null;
    socket.onmessage = null;
    socket.onclose = null;

    try {
      socket.close(1000);
    } catch (error) {
      console.warn('[stream] could not close the streaming socket', error);
    }
  }

  private clearTimer() {
    if (this.timer === null) return;

    clearTimeout(this.timer);
    this.timer = null;
  }
}

export interface WakeTarget {
  wake: (distrustOpenSocket: boolean) => void;
}

export const installWakeHandlers = (
  getTarget: () => WakeTarget | undefined,
  now: () => number = Date.now,
) => {
  let hiddenSince: number | null =
    document.visibilityState === 'hidden' ? now() : null;

  const wake = (distrust: boolean) => {
    getTarget()?.wake(distrust);
  };

  const hiddenLongEnough = () =>
    hiddenSince !== null && now() - hiddenSince >= STALE_AFTER_HIDDEN_MS;

  const handleVisibility = () => {
    if (document.visibilityState === 'hidden') {
      hiddenSince ??= now();
      return;
    }

    const distrust = hiddenLongEnough();
    hiddenSince = null;
    wake(distrust);
  };

  const handleResume = () => {
    if (document.visibilityState === 'hidden') return;

    wake(hiddenLongEnough());
  };

  const handleOnline = () => {
    wake(false);
  };

  const handlePageShow = (event: PageTransitionEvent) => {
    if (event.persisted) wake(true);
  };

  document.addEventListener('visibilitychange', handleVisibility);
  document.addEventListener('resume', handleResume);
  window.addEventListener('online', handleOnline);
  window.addEventListener('pageshow', handlePageShow);

  return () => {
    document.removeEventListener('visibilitychange', handleVisibility);
    document.removeEventListener('resume', handleResume);
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('pageshow', handlePageShow);
  };
};
