/**
 * The app-icon badge (the number on the springboard icon).
 *
 * Until now nothing in the app ever wrote this number: it was set only by the
 * `badge` field of an incoming push, computed server-side at push time. Nothing
 * decremented it and nothing zeroed it, so it drifted upward and stayed stale
 * after the user had read everything.
 *
 * The rule now is R3: the icon badge equals the chat tab total, always. The one
 * caller is MainTabs in AppNavigator, which owns the single mounted
 * useTotalChatUnread. Keeping the write in one module means there is one place
 * that talks to expo-notifications about badges.
 *
 * This module NEVER requests notification permission. On iOS the badge is part
 * of the notification permission the user may not have granted; asking here
 * would put a permission prompt behind a passive counter update. Without the
 * permission setBadgeCountAsync simply resolves false, which is not an error.
 */

import * as Notifications from 'expo-notifications';
import { logError } from '../utils/logError';

/**
 * Absorbed on purpose: a badge we failed to set is a cosmetic wrong number, not
 * something to surface or throw over. It is still reported so a device log shows
 * it rather than nothing (the lesson of utils/logError).
 */
async function write(count: number): Promise<void> {
  const value = Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;
  try {
    await Notifications.setBadgeCountAsync(value);
  } catch (error) {
    logError('appBadge.write', error, { count: value });
  }
}

/**
 * Set the icon badge to the current chat total.
 *
 * No-op without a session: between sign-out and the next sign-in there is no
 * "my unread" to show, and a signed-out app must not keep writing the last
 * user's number onto the icon. Pass the live user id, not a boolean, so the
 * caller cannot accidentally pass a stale `true`.
 */
export async function syncAppBadge(
  count: number,
  userId: string | null | undefined
): Promise<void> {
  if (!userId) return;
  await write(count);
}

/** Sign-out: clear the number so the icon does not keep the last user's count. */
export async function clearAppBadge(): Promise<void> {
  await write(0);
}
