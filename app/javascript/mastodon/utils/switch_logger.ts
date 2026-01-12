/**
 * Logging utility for multi-account switching operations
 */

interface SwitchLogData {
  event: string;
  accountId?: string;
  success: boolean;
  reason?: string;
  latencyMs?: number;
  reloadCount?: number;
  stage?: string;
  timestamp: string;
}

class SwitchLogger {
  private static logToConsole(data: SwitchLogData): void {
    const message = `[MultiAccount] ${data.event}: ${data.success ? 'success' : 'failed'}`;
    if (data.success) {
      console.log(message, data);
    } else {
      console.warn(message, data);
    }
  }

  private static logToServer(data: SwitchLogData): void {
    try {
      if (
        typeof window === 'undefined' ||
        typeof navigator === 'undefined' ||
        typeof navigator.sendBeacon !== 'function'
      ) {
        return;
      }

      const endpoint =
        (window as any).__MA_MULTI_ACCOUNT_LOG_ENDPOINT__ ?? null;

      if (!endpoint) {
        return;
      }

      const blob = new Blob([JSON.stringify(data)], {
        type: 'application/json',
      });
      navigator.sendBeacon(endpoint, blob);
    } catch (error) {
      // Silently ignore logging failures
    }
  }

  static logSwitchAttempt(accountId: string): number {
    const startTime = performance.now();
    const timestamp = new Date().toISOString();

    this.logToConsole({
      event: 'switch_attempt',
      accountId,
      success: true,
      timestamp,
    });

    return startTime;
  }

  static logSwitchSuccess(
    accountId: string,
    startTime: number,
    reloadCount?: number,
  ): void {
    const latencyMs = Math.round(performance.now() - startTime);
    const timestamp = new Date().toISOString();

    const data: SwitchLogData = {
      event: 'switch_success',
      accountId,
      success: true,
      latencyMs,
      timestamp,
    };

    if (reloadCount !== undefined) {
      data.reloadCount = reloadCount;
    }

    this.logToConsole(data);
    this.logToServer(data);

    // Record performance metric
    if (performance.mark && performance.measure) {
      performance.mark(`multi_account_switch_end_${accountId}`);
      try {
        performance.measure(
          `multi_account_switch_${accountId}`,
          `multi_account_switch_start_${accountId}`,
          `multi_account_switch_end_${accountId}`,
        );
      } catch (error) {
        // Ignore if mark doesn't exist
      }
    }
  }

  static logSwitchFailure(
    accountId: string,
    reason: string,
    startTime?: number,
  ): void {
    const latencyMs = startTime
      ? Math.round(performance.now() - startTime)
      : undefined;
    const timestamp = new Date().toISOString();

    const data: SwitchLogData = {
      event: 'switch_failure',
      accountId,
      success: false,
      reason,
      timestamp,
    };

    if (latencyMs !== undefined) {
      data.latencyMs = latencyMs;
    }

    this.logToConsole(data);
    this.logToServer(data);

    // Send to Sentry if available
    if (typeof window !== 'undefined' && (window as any).Sentry) {
      (window as any).Sentry.captureException(new Error(reason), {
        extra: data,
      });
    }
  }

  static logRefreshAttempt(refreshTokenId: string): number {
    const startTime = performance.now();
    const timestamp = new Date().toISOString();

    this.logToConsole({
      event: 'refresh_attempt',
      success: true,
      timestamp,
    });

    return startTime;
  }

  static logRefreshSuccess(
    refreshTokenId: string,
    startTime: number,
  ): void {
    const latencyMs = Math.round(performance.now() - startTime);
    const timestamp = new Date().toISOString();

    const data: SwitchLogData = {
      event: 'refresh_success',
      success: true,
      latencyMs,
      timestamp,
    };

    this.logToConsole(data);
    this.logToServer(data);
  }

  static logRefreshFailure(
    refreshTokenId: string,
    reason: string,
    startTime?: number,
  ): void {
    const latencyMs = startTime
      ? Math.round(performance.now() - startTime)
      : undefined;
    const timestamp = new Date().toISOString();

    const data: SwitchLogData = {
      event: 'refresh_failure',
      success: false,
      reason,
      timestamp,
    };

    if (latencyMs !== undefined) {
      data.latencyMs = latencyMs;
    }

    this.logToConsole(data);
    this.logToServer(data);

    // Send to Sentry if available
    if (typeof window !== 'undefined' && (window as any).Sentry) {
      (window as any).Sentry.captureException(new Error(reason), {
        extra: data,
      });
    }
  }

  static logCacheClear(success: boolean, reason?: string): void {
    const timestamp = new Date().toISOString();

    const data: SwitchLogData = {
      event: 'cache_clear',
      success,
      timestamp,
    };

    if (reason) {
      data.reason = reason;
    }

    this.logToConsole(data);
  }

  static logReload(count: number): void {
    const timestamp = new Date().toISOString();

    this.logToConsole({
      event: 'reload',
      success: true,
      reloadCount: count,
      timestamp,
    });
  }

  static logCsrfRefresh(
    stage: string,
    success: boolean,
    reason?: string,
  ): void {
    const timestamp = new Date().toISOString();

    const data: SwitchLogData = {
      event: 'csrf_refresh',
      stage,
      success,
      timestamp,
    };

    if (reason) {
      data.reason = reason;
    }

    this.logToConsole(data);
    this.logToServer(data);

    if (!success && typeof window !== 'undefined' && (window as any).Sentry) {
      (window as any).Sentry.captureMessage(
        `MultiAccount CSRF refresh failed at ${stage}`,
        {
          level: 'warning',
          extra: data,
        },
      );
    }
  }
}

export default SwitchLogger;

