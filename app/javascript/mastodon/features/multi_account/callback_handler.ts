interface CallbackMessage {
  type: string;
  state?: string;
  code?: string;
  error?: string;
}

interface PendingRequest {
  resolve: (data: { state: string; code: string }) => void;
  reject: (error: Error) => void;
  state: string;
  popup: Window | null;
  checkInterval: number;
}

const pendingRequests = new Map<string, PendingRequest>();

const releasePending = (state: string, pending: PendingRequest) => {
  if (pending.checkInterval) {
    clearInterval(pending.checkInterval);
  }

  if (pending.popup && !pending.popup.closed) {
    try {
      pending.popup.postMessage(
        { type: 'multi-account-close-popup' },
        window.location.origin,
      );
    } catch (error) {
      console.error('Failed to send close message to popup:', error);
    }
  }

  pendingRequests.delete(state);
};

const isFromOwnPopup = (
  event: MessageEvent,
  pending: PendingRequest,
): boolean =>
  event.origin === window.location.origin &&
  !!pending.popup &&
  event.source === pending.popup;

const handleCallback = (event: MessageEvent, data: CallbackMessage) => {
  const { state, code } = data;

  if (!state || !code) {
    console.error('Invalid callback data:', data);
    return;
  }

  const pending = pendingRequests.get(state);

  if (!pending) {
    console.warn('Received callback for unknown state:', state);
    return;
  }

  if (!isFromOwnPopup(event, pending)) {
    console.warn('Ignoring callback from an unexpected window or origin');
    return;
  }

  pending.resolve({ state, code });
  releasePending(state, pending);
};

const handleError = (event: MessageEvent, data: CallbackMessage) => {
  const { error, state } = data;
  const reason = new Error(error || 'Unknown error');

  if (state) {
    const pending = pendingRequests.get(state);

    if (pending && isFromOwnPopup(event, pending)) {
      pending.reject(reason);
      releasePending(state, pending);
    }

    return;
  }

  console.warn('Received error without state, rejecting its pending requests');

  for (const [stateKey, pending] of [...pendingRequests.entries()]) {
    if (isFromOwnPopup(event, pending)) {
      pending.reject(reason);
      releasePending(stateKey, pending);
    }
  }
};

/**
 * Handle OAuth callback messages from the popup window
 */
const handleMessage = (event: MessageEvent) => {
  if (event.origin !== window.location.origin) {
    console.warn(
      'Ignoring message from unexpected origin:',
      event.origin,
      'expected:',
      window.location.origin,
    );
    return;
  }

  const data = event.data as CallbackMessage | null;

  if (!data || typeof data !== 'object') {
    return;
  }

  if (data.type === 'multi-account-callback') {
    handleCallback(event, data);
  } else if (data.type === 'multi-account-error') {
    handleError(event, data);
  }
};

/**
 * Initialize the callback handler
 */
export const initializeCallbackHandler = () => {
  if (typeof window !== 'undefined') {
    window.addEventListener('message', handleMessage);
  }
};

/**
 * Clean up the callback handler
 */
export const cleanupCallbackHandler = () => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('message', handleMessage);

    // Clear all pending requests and their intervals
    for (const [state, pending] of pendingRequests.entries()) {
      if (pending.checkInterval) {
        clearInterval(pending.checkInterval);
      }
      pending.reject(new Error('Callback handler was cleaned up'));
      pendingRequests.delete(state);
    }
  }
};

/**
 * Open OAuth popup and wait for callback
 */
export const openOAuthPopup = (
  authorizeUrl: string,
  state: string,
  existingPopup?: Window | null,
): Promise<{ state: string; code: string }> => {
  return new Promise((resolve, reject) => {
    // Open popup window
    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup =
      existingPopup ||
      window.open(
        authorizeUrl,
        'multi-account-oauth',
        `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,location=no`,
      );

    if (!popup) {
      reject(new Error('Failed to open popup window'));
      pendingRequests.delete(state);
      return;
    }

    // Navigate to authorize URL if using existing popup
    if (existingPopup) {
      try {
        popup.location.href = authorizeUrl;
      } catch (error) {
        console.error('Failed to navigate popup:', error);
        reject(new Error('Failed to navigate popup window'));
        return;
      }
    }

    // Check if popup was closed before completion
    const checkInterval = window.setInterval(() => {
      if (popup.closed) {
        clearInterval(checkInterval);
        const pending = pendingRequests.get(state);
        if (pending) {
          pending.reject(
            new Error('OAuth popup was closed before authorization completed'),
          );
          pendingRequests.delete(state);
        }
      }
    }, 500);

    // Add timeout to prevent hanging forever
    const timeoutId = window.setTimeout(() => {
      const pending = pendingRequests.get(state);
      if (pending) {
        clearInterval(pending.checkInterval);
        try {
          if (pending.popup && !pending.popup.closed) {
            pending.popup.close();
          }
        } catch {
          // ignore: popup may be inaccessible/cross-origin
        }
        pending.reject(
          new Error('OAuth authorization timed out. Please try again.'),
        );
        pendingRequests.delete(state);
      }
    }, 90000); // 90s timeout

    // Store the promise handlers with popup reference and interval ID
    pendingRequests.set(state, {
      resolve: (data) => {
        clearTimeout(timeoutId);
        resolve(data);
      },
      reject: (error) => {
        clearTimeout(timeoutId);
        reject(error);
      },
      state,
      popup,
      checkInterval,
    });
  });
};

/**
 * Cancel all in-flight OAuth popup requests (manual cancel from the UI).
 * Closes any open popups, clears their watchers, and rejects the pending
 * promises so the caller's finally{} runs and the UI state is released.
 */
export const cancelPendingOAuthRequests = () => {
  for (const [state, pending] of pendingRequests.entries()) {
    if (pending.checkInterval) {
      clearInterval(pending.checkInterval);
    }

    try {
      if (pending.popup && !pending.popup.closed) {
        pending.popup.close();
      }
    } catch {
      // ignore: popup may be inaccessible/cross-origin
    }

    pending.reject(new Error('OAuth authorization was cancelled.'));
    pendingRequests.delete(state);
  }
};
