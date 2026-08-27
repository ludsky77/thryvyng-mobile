/**
 * Single caller for the `check-email-exists` edge function.
 *
 * The function requires a Turnstile token in `body.captchaToken` and answers
 * 400 `captcha-failed` without one. Every mobile surface used to invoke it
 * tokenless and then misread the guaranteed failure as an answer — the player
 * claim treated it as "email is taken", the staff paths as "no account here".
 * Routing all of them through here means the token is never forgotten and,
 * more importantly, that "we could not find out" is a *distinct* result from
 * "the answer is no" rather than collapsing into it.
 *
 * `exists: null` therefore means unknown, and callers must not act on it as if
 * it were `false`.
 */
import { supabase } from './supabase';
import { getCaptchaToken } from './captcha';

export interface EmailExistsResult {
  exists: boolean;
  userId?: string;
  roles?: string[];
}

export interface EmailExistsUnknown {
  exists: null;
  reason: string;
}

export async function checkEmailExists(
  email: string
): Promise<EmailExistsResult | EmailExistsUnknown> {
  const normalized = email.trim().toLowerCase();

  // getCaptchaToken rejects on timeout/widget-error/cancel and resolves null
  // only when no host is mounted, so both paths have to be handled here.
  let token: string | null;
  try {
    token = await getCaptchaToken();
  } catch (captchaErr: any) {
    if (__DEV__) console.log('[checkEmailExists] Captcha failed:', captchaErr);
    return { exists: null, reason: captchaErr?.name || 'captcha' };
  }

  if (!token) {
    // No token means the server will reject the call, so fail here instead of
    // spending a round trip to be told the same thing.
    return { exists: null, reason: 'captcha' };
  }

  try {
    const { data, error } = await supabase.functions.invoke('check-email-exists', {
      body: { email: normalized, captchaToken: token },
    });

    if (error || !data || typeof data.exists !== 'boolean') {
      if (__DEV__) {
        console.log('[checkEmailExists] Lookup failed:', error ?? data);
      }
      return { exists: null, reason: error?.message || 'invoke' };
    }

    return { exists: data.exists, userId: data.userId, roles: data.roles };
  } catch (err: any) {
    if (__DEV__) console.log('[checkEmailExists] Lookup threw:', err);
    return { exists: null, reason: err?.message || 'invoke' };
  }
}

export default checkEmailExists;
