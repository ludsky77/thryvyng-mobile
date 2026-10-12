/**
 * The chat tab total.
 *
 * The fetch, the rule and every refresh trigger now live in
 * contexts/ChatUnreadContext, so that the tab total and ChatScreen's list are
 * produced by ONE call and cannot disagree. See that file's header for why.
 *
 * This module stays as the stable entry point:
 *   - useTotalChatUnread()        -- just the number
 *   - requestChatUnreadRefresh()  -- re-exported so the three mark-read
 *                                    writers keep importing it from here
 */

import { useChatUnread } from '../contexts/ChatUnreadContext';

export { requestChatUnreadRefresh } from '../contexts/ChatUnreadContext';

/** The number on the Chat tab badge: the sum of unread over countable channels. */
export function useTotalChatUnread(): number {
  return useChatUnread().total;
}
