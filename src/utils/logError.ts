/**
 * One place to report a failure.
 *
 * The pattern this replaces was `if (error && __DEV__) console.warn(...)`,
 * repeated across the chat stack and elsewhere. It has cost two device round
 * trips now: a release build is not __DEV__, so every one of those sites was
 * completely silent on the exact builds we test on, and a read that failed
 * looked identical to a read that returned nothing.
 *
 * Rules:
 *   * console.warn ALWAYS, in one fixed format, dev or prod.
 *   * Sentry gets it too, via services/sentry's captureError, which already
 *     owns the "disabled in development" gate -- so the gate lives in exactly
 *     one place and this module never tests __DEV__ itself.
 *
 * This is for failures we are ABSORBING -- a degraded read, a refused write we
 * rolled back. Anything the user must act on keeps its own Alert; logError is
 * the record, not the user-facing message.
 */

import { captureError } from '../services/sentry';

/** Anything can be thrown or returned as an error. Get a real Error out of it. */
function toError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (typeof error === 'string') return new Error(error);
  // Supabase returns a plain object: { message, code, details, hint }.
  const anyErr = error as { message?: string; code?: string } | null | undefined;
  const message = anyErr?.message || 'Unknown error';
  const err = new Error(anyErr?.code ? `${message} (${anyErr.code})` : message);
  return err;
}

/**
 * @param scope  where it happened, e.g. 'useMessages.sendMessage'. Shows up as
 *               `[useMessages.sendMessage]` in the console and as Sentry context.
 * @param error  whatever came back -- Error, supabase error object, or string.
 * @param extra  ids and state worth having when reading the report later.
 */
export function logError(
  scope: string,
  error: unknown,
  extra?: Record<string, unknown>
): void {
  const err = toError(error);

  // Fixed format so these are greppable in a device log: [scope] message {extra}
  if (extra && Object.keys(extra).length > 0) {
    console.warn(`[${scope}] ${err.message}`, extra);
  } else {
    console.warn(`[${scope}] ${err.message}`);
  }

  captureError(err, { scope, ...(extra ?? {}) });
}
