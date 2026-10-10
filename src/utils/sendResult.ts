/**
 * What happened when a message send was attempted, and what to tell the user.
 *
 * sendMessage used to return a bare `false` for six unrelated failures, and
 * ChatInputBar turned every one of them into "Your attachment could not be
 * uploaded." A text-only reply that failed its INSERT therefore blamed an
 * attachment that did not exist, which sent a device investigation at the
 * wrong subsystem. The reason travels with the result now, and the copy is
 * derived from it rather than hard-coded at the call site.
 *
 * Pure: no React, no supabase, no Alert. The mapper is the testable part.
 */

export type SendFailureReason =
  /** Nothing to send, or no channel -- a caller bug, not a user error. */
  | 'validation'
  /** The bytes never reached storage. The only reason that may mention attachments. */
  | 'attachment_upload'
  /** The comm_messages row was refused (RLS, constraint, unknown column). */
  | 'insert'
  /** No signed-in user. */
  | 'auth'
  /** Threw, or something we have not classified. */
  | 'unknown';

export type SendResult =
  | { ok: true }
  | { ok: false; reason: SendFailureReason; detail?: string };

export const SEND_OK: SendResult = { ok: true };

/** Build a failure without repeating the shape at every return site. */
export function sendFailure(
  reason: SendFailureReason,
  detail?: string
): SendResult {
  return detail ? { ok: false, reason, detail } : { ok: false, reason };
}

export interface SendFailureCopy {
  title: string;
  body: string;
}

/**
 * The alert copy for a failure reason.
 *
 * Only 'attachment_upload' is allowed to talk about attachments. 'insert' and
 * 'unknown' get the honest generic line, because at that point the text is
 * what failed and we do not know why.
 *
 * 'validation' returns copy too, but callers normally never show it: there is
 * nothing to send, so the send button is disabled and the user has not asked
 * for anything. It exists so the mapper is total.
 */
export function sendFailureCopy(reason: SendFailureReason): SendFailureCopy {
  switch (reason) {
    case 'attachment_upload':
      return {
        title: 'Message not sent',
        body: 'Your attachment could not be uploaded. Please try again.',
      };
    case 'auth':
      return {
        title: 'Message not sent',
        body: 'You appear to be signed out. Sign in again and retry.',
      };
    case 'validation':
      // Worded without the word "attach" on purpose: the test asserts that no
      // reason other than attachment_upload can put that word in front of a
      // user, which is the whole regression guard.
      return {
        title: 'Nothing to send',
        body: 'Type a message or add a file first.',
      };
    case 'insert':
    case 'unknown':
    default:
      return {
        title: "Message couldn't be sent",
        body: 'Your message was not saved. Please try again.',
      };
  }
}

/** True when the user should be shown an alert for this result. */
export function shouldAlertForResult(result: SendResult | void): boolean {
  // `void` is a caller that opted out of result reporting (e.g. a slash
  // command that handled itself). Never alert for those.
  if (!result || typeof result !== 'object') return false;
  if (result.ok) return false;
  // Nothing was sendable, so nothing was attempted -- an alert would be noise.
  return result.reason !== 'validation';
}
