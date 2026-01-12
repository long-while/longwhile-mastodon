import type { AppDispatch } from '../../store';

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

/**
 * Handle OAuth callback messages from the popup window
 */
const handleMessage = (event: MessageEvent) => {
  const data = event.data as CallbackMessage;

  // Verify origin - allow same origin or check if it's from our domain
  const eventOrigin = event.origin;
  const currentOrigin = window.location.origin;
  
  // Allow messages from same origin or if origin matches current origin pattern
  // This handles cases where redirect_origin might differ slightly (http vs https, port differences)
  const isOriginValid = 
    eventOrigin === currentOrigin ||
    eventOrigin.replace(/^https?:\/\//, '').split(':')[0] === currentOrigin.replace(/^https?:\/\//, '').split(':')[0];

  if (!isOriginValid && eventOrigin !== '*') {
    console.warn('Received message from unexpected origin:', eventOrigin, 'expected:', currentOrigin);
    // Still process the message but log a warning
  }

  if (data.type === 'multi-account-callback') {
    const { state, code } = data;

    if (!state || !code) {
      console.error('Invalid callback data:', data);
      return;
    }

    const pending = pendingRequests.get(state);
    if (pending) {
      pending.resolve({ state, code });

      // Clear the popup check interval
      if (pending.checkInterval) {
        clearInterval(pending.checkInterval);
      }

      // Send close confirmation to popup
      if (pending.popup && !pending.popup.closed) {
        try {
          // Try current origin first
          pending.popup.postMessage(
            { type: 'multi-account-close-popup' },
            currentOrigin
          );
        } catch (error) {
          console.error('Failed to send close message to popup:', error);
          // Try with wildcard as fallback
          try {
            pending.popup.postMessage(
              { type: 'multi-account-close-popup' },
              '*'
            );
          } catch (e2) {
            console.error('Failed to send close message with wildcard:', e2);
          }
        }
      }

      pendingRequests.delete(state);
    } else {
      console.warn('Received callback for unknown state:', state);
    }
  } else if (data.type === 'multi-account-error') {
    const { error, state } = data;

    if (state) {
      // If we have state, reject only that specific request
      const pending = pendingRequests.get(state);
      if (pending) {
        pending.reject(new Error(error || 'Unknown error'));

        // Clear the popup check interval
        if (pending.checkInterval) {
          clearInterval(pending.checkInterval);
        }

        // Send close confirmation to popup
        if (pending.popup && !pending.popup.closed) {
          try {
            pending.popup.postMessage(
              { type: 'multi-account-close-popup' },
              currentOrigin
            );
          } catch (error) {
            console.error('Failed to send close message to popup:', error);
          }
        }

        pendingRequests.delete(state);
      }
    } else {
      // If no state, reject all pending requests
      console.warn('Received error without state, rejecting all pending requests');
      for (const [stateKey, pending] of pendingRequests.entries()) {
        pending.reject(new Error(error || 'Unknown error'));

        // Clear the popup check interval
        if (pending.checkInterval) {
          clearInterval(pending.checkInterval);
        }

        // Send close confirmation to popup
        if (pending.popup && !pending.popup.closed) {
          try {
            pending.popup.postMessage(
              { type: 'multi-account-close-popup' },
              currentOrigin
            );
          } catch (error) {
            console.error('Failed to send close message to popup:', error);
          }
        }

        pendingRequests.delete(stateKey);
      }
    }
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
          pending.reject(new Error('OAuth popup was closed before authorization completed'));
          pendingRequests.delete(state);
        }
      }
    }, 500);

    // Add timeout to prevent hanging forever
    const timeoutId = window.setTimeout(() => {
      const pending = pendingRequests.get(state);
      if (pending) {
        clearInterval(pending.checkInterval);
        pending.reject(new Error('OAuth authorization timed out. Please try again.'));
        pendingRequests.delete(state);
      }
    }, 120000); // 2 minutes timeout

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
      checkInterval 
    });
  });
};

/**
 * Complete account registration after OAuth callback
 */
export const completeAccountRegistration = (callbackData: {
  state: string;
  code: string;
}) => {
  return async (dispatch: AppDispatch) => {
    // This will be implemented when we integrate with the actions
    console.log('Completing account registration:', callbackData);
    // TODO: Call API to consume the authorization code and register the account
  };
};
