/**
 * Cloudflare Turnstile token acquisition.
 *
 * `getCaptchaToken()` is deliberately forgiving: it resolves `null` — rather
 * than rejecting — whenever a token cannot be produced (no host mounted, user
 * cancelled, widget error, or timeout). Callers pass the result straight to
 * Supabase as `captchaToken: token ?? undefined` and proceed tokenless while
 * captcha enforcement is still switched off server-side. Once enforcement is
 * turned on, a `null` here becomes a server-side rejection with a real error
 * message, which is the behaviour we want at that point.
 */

/** How long to wait for the widget before giving up and letting the call through. */
export const CAPTCHA_TIMEOUT_MS = 15000;

type Settle = (token: string | null) => void;

export interface CaptchaHostHandle {
  /** Show the captcha sheet; call `settle` exactly once with a token or null. */
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
 * Resolves `null` (never rejects) when the host is missing, another request is
 * already open, the user cancels, the widget errors, or {@link CAPTCHA_TIMEOUT_MS}
 * elapses.
 */
export function getCaptchaToken(): Promise<string | null> {
  const activeHost = host;

  if (!activeHost) {
    if (__DEV__) console.warn('[captcha] No captcha host mounted; proceeding without a token.');
    return Promise.resolve(null);
  }

  if (requestInFlight) {
    if (__DEV__) console.warn('[captcha] A captcha request is already open; proceeding without a token.');
    return Promise.resolve(null);
  }

  requestInFlight = true;

  return new Promise<string | null>((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const settle: Settle = (token) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      requestInFlight = false;
      try {
        activeHost.close();
      } catch {
        // A failed dismiss must not strand the caller.
      }
      resolve(token);
    };

    timer = setTimeout(() => {
      if (__DEV__) console.warn('[captcha] Timed out; proceeding without a token.');
      settle(null);
    }, CAPTCHA_TIMEOUT_MS);

    try {
      activeHost.open(settle);
    } catch (err) {
      if (__DEV__) console.warn('[captcha] Failed to open captcha host:', err);
      settle(null);
    }
  });
}
