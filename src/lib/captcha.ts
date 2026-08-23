/**
 * Cloudflare Turnstile token acquisition.
 *
 * Captcha enforcement is ON server-side, so a missing token is no longer a
 * survivable state — a tokenless auth call is a request we already know will be
 * rejected, which surfaces to the user as a confusing generic auth failure.
 * `getCaptchaToken()` therefore reports *why* no token was produced instead of
 * flattening every outcome to `null`:
 *
 *   - success                → resolves with the Turnstile token
 *   - timeout / widget error → rejects with {@link CaptchaTimeoutError}
 *   - user cancelled         → rejects with {@link CaptchaCancelledError}
 *   - no host mounted        → resolves `null` (dev-only escape hatch)
 *
 * Callers must therefore try/catch: on {@link CaptchaTimeoutError} show
 * {@link CAPTCHA_TIMEOUT_MESSAGE} through the surface's own error mechanism and
 * abort the auth call; on {@link CaptchaCancelledError} abort quietly. A `null`
 * still means "proceed tokenless", which now only happens when no CaptchaHost
 * is mounted.
 */

/** How long to wait for the widget before giving up on it. */
export const CAPTCHA_TIMEOUT_MS = 15000;

/**
 * The one canonical timeout message. Six surfaces render it; it is written
 * here so they cannot drift apart.
 */
export const CAPTCHA_TIMEOUT_MESSAGE =
  'Verification took too long. Check your connection and try again.';

/** Why a captcha request ended without a token. */
export type CaptchaFailureReason = 'timeout' | 'error' | 'cancel';

/**
 * No token because the widget timed out or errored. The caller must abort the
 * auth call and offer a retry — proceeding would be a request we know fails.
 */
export class CaptchaTimeoutError extends Error {
  readonly reason: 'timeout' | 'error';

  constructor(reason: 'timeout' | 'error', detail?: string) {
    super(
      detail ??
        (reason === 'timeout'
          ? 'Captcha timed out before returning a token.'
          : 'The captcha widget failed before returning a token.')
    );
    this.name = 'CaptchaTimeoutError';
    this.reason = reason;
    // Hermes downlevels `extends Error`; without this `instanceof` is false and
    // every caller's branch silently misses.
    Object.setPrototypeOf(this, CaptchaTimeoutError.prototype);
  }
}

/** No token because the user dismissed the sheet. Abort without an error banner. */
export class CaptchaCancelledError extends Error {
  constructor() {
    super('Captcha was cancelled by the user.');
    this.name = 'CaptchaCancelledError';
    Object.setPrototypeOf(this, CaptchaCancelledError.prototype);
  }
}

type Settle = (token: string | null, reason?: CaptchaFailureReason) => void;

export interface CaptchaHostHandle {
  /**
   * Show the captcha sheet; call `settle` exactly once — with a token, or with
   * `null` plus the reason it failed so the caller can tell a cancel from a
   * breakage.
   */
  open: (settle: Settle) => void;
  /** Hide the sheet. Safe to call when already hidden. */
  close: () => void;
}

let host: CaptchaHostHandle | null = null;
let requestInFlight = false;

/**
 * Called by the host mounted at the App root. Returns an unregister function
 * for the effect cleanup.
 */
export function registerCaptchaHost(handle: CaptchaHostHandle): () => void {
  host = handle;
  return () => {
    if (host === handle) host = null;
  };
}

/** Test/diagnostic helper: whether a captcha host is currently mounted. */
export function isCaptchaHostReady(): boolean {
  return host !== null;
}

/**
 * Opens the captcha sheet and resolves with a Turnstile token.
 *
 * Resolves `null` ONLY when no host is mounted (dev). Rejects with
 * {@link CaptchaTimeoutError} when {@link CAPTCHA_TIMEOUT_MS} elapses, the
 * widget errors, or a request is already open; rejects with
 * {@link CaptchaCancelledError} when the user dismisses the sheet.
 */
export function getCaptchaToken(): Promise<string | null> {
  const activeHost = host;

  if (!activeHost) {
    if (__DEV__) console.warn('[captcha] No captcha host mounted; proceeding without a token.');
    return Promise.resolve(null);
  }

  if (requestInFlight) {
    if (__DEV__) console.warn('[captcha] A captcha request is already open.');
    return Promise.reject(
      new CaptchaTimeoutError('error', 'A captcha request is already open.')
    );
  }

  requestInFlight = true;

  return new Promise<string | null>((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const settle: Settle = (token, reason) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      requestInFlight = false;
      try {
        activeHost.close();
      } catch {
        // A failed dismiss must not strand the caller.
      }
      if (token) {
        resolve(token);
        return;
      }
      if (reason === 'cancel') {
        reject(new CaptchaCancelledError());
        return;
      }
      // An unexplained tokenless settle is a breakage, not a cancellation:
      // fail loud rather than swallow it.
      reject(new CaptchaTimeoutError(reason === 'timeout' ? 'timeout' : 'error'));
    };

    timer = setTimeout(() => {
      if (__DEV__) console.warn('[captcha] Timed out waiting for a token.');
      settle(null, 'timeout');
    }, CAPTCHA_TIMEOUT_MS);

    try {
      activeHost.open(settle);
    } catch (err) {
      if (__DEV__) console.warn('[captcha] Failed to open captcha host:', err);
      settle(null, 'error');
    }
  });
}
