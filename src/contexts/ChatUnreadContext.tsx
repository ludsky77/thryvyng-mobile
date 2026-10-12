/**
 * ONE source for the chat list and the chat tab total.
 *
 * WHY THIS EXISTS
 * ---------------
 * Simulator test, Oct 11: two messages arrived with the app open on the Chat
 * tab. The conversation row showed "2" at once; the tab badge showed nothing
 * until the app was backgrounded and foregrounded.
 *
 * The cause was structural, not a missing event. ChatScreen and the tab total
 * were two independent fetchers of the same RPC: ChatScreen refetched on every
 * incoming message immediately, while the total sat behind a 3000 ms debounce.
 * Two fetches, two schedules, two answers -- so the row and the badge could
 * always be showing different moments in time, and "the list updates and the
 * total does not" is exactly what that looks like.
 *
 * Now there is one fetch. This provider owns it, owns every trigger that should
 * re-run it, and hands out the classified rows AND the total from the same
 * result. classifyConversationRows computes `total` as the sum over `mainRows`,
 * so the tab badge is the sum of the rows the list is showing -- not a second
 * opinion about them.
 *
 * Triggers: mount, an incoming comm_messages INSERT (any tab, no background
 * needed), this user's comm_channel_members UPDATE (mark-read from another
 * device), app foreground, and requestChatUnreadRefresh() from the three
 * mark-read writers. All but foreground and pull-to-refresh go through one
 * leading-edge throttle.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { supabase } from '../lib/supabase';
import { subscribeToMessageInserts } from '../lib/realtimeHub';
import { useAuth } from './AuthContext';
import { useSharedUserTeams } from './TeamsContext';
import { classifyConversationRows } from '../utils/unreadRule';
import { logError } from '../utils/logError';

/*
 * Rate limit for the refresh triggers.
 *
 * A THROTTLE, not a debounce, and the difference matters: a trailing debounce
 * resets on every call, so a stream of messages arriving less than the window
 * apart would postpone the refresh for as long as the stream lasted -- the one
 * case where the count moves fastest would be the one case it never updated.
 * Leading edge instead, so the first event refreshes with no delay at all,
 * plus one guaranteed trailing call so the last event in a burst is not lost.
 */
const REFRESH_THROTTLE_MS = 250;

type RefreshListener = () => void;
const refreshListeners = new Set<RefreshListener>();
let lastRefreshAt = 0;
let trailingTimer: ReturnType<typeof setTimeout> | null = null;

function runRefreshListeners(): void {
  lastRefreshAt = Date.now();
  refreshListeners.forEach((listener) => {
    try {
      listener();
    } catch (error) {
      logError('ChatUnread.refreshListener', error);
    }
  });
}

/**
 * Re-count the chat total and reload the conversation rows now.
 *
 * Module-level so the mark-read writers -- which live in screens inside other
 * navigators -- can reach the single mounted provider without prop or provider
 * plumbing. Safe to call when nothing is mounted.
 */
export function requestChatUnreadRefresh(): void {
  const sinceLast = Date.now() - lastRefreshAt;
  if (sinceLast >= REFRESH_THROTTLE_MS) {
    runRefreshListeners();
    return;
  }
  // Inside the window: one trailing call is enough, and one is guaranteed.
  if (trailingTimer) return;
  trailingTimer = setTimeout(() => {
    trailingTimer = null;
    runRefreshListeners();
  }, REFRESH_THROTTLE_MS - sinceLast);
}

export interface ChatUnreadValue {
  /** Channels whose unread counts; what the main list renders. */
  mainRows: any[];
  /** Retired-team channels; what the Past section renders. */
  pastRows: any[];
  /** Sum of unread_count over mainRows. The tab badge number. */
  total: number;
  loading: boolean;
  /** First fetch has resolved. Until then "no conversations" is not a fact. */
  hasLoadedOnce: boolean;
  /**
   * Increments on every SUCCESSFUL recount, even when `total` is unchanged.
   * The app-icon badge writer keys on this: a push can change the OS badge
   * while the app is backgrounded, so coming back to the same total still has
   * to re-apply the number. A failed fetch does not tick -- re-applying a
   * number we failed to verify would be worse than leaving it.
   */
  syncTick: number;
  /** Throttled. Use for event-driven refreshes. */
  refresh: () => void;
  /** Immediate and awaitable. Use for pull-to-refresh. */
  refreshNow: () => Promise<void>;
}

const EMPTY = { mainRows: [] as any[], pastRows: [] as any[], total: 0 };

const ChatUnreadContext = createContext<ChatUnreadValue | undefined>(undefined);

export function ChatUnreadProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const {
    teamLifecycle,
    loading: teamsLoading,
    error: teamsError,
  } = useSharedUserTeams();

  const [rows, setRows] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [syncTick, setSyncTick] = useState(0);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const refreshNow = useCallback(async () => {
    if (!user?.id) {
      setRows(EMPTY);
      setLoading(false);
      setHasLoadedOnce(true);
      return;
    }

    /*
     * Without a trustworthy team lifecycle the rule cannot tell a retired team
     * from a live one. Recomputing against an empty map would silently promote
     * every past-team channel into the main list and the total. So while teams
     * are loading OR their fetch failed, hold the last good rows and the last
     * good total and change nothing.
     */
    if (teamsLoading || teamsError) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_my_conversations');

      // A failed read is not "no conversations" and not "no unread".
      if (error) {
        logError('ChatUnread.getMyConversations', error, { userId: user.id });
        return;
      }
      if (!isMountedRef.current) return;

      // One pass produces both lists and the total, so they cannot disagree.
      setRows(classifyConversationRows(data as any[], teamLifecycle));
      setSyncTick((tick) => tick + 1);
    } catch (err) {
      logError('ChatUnread.refreshNow', err, { userId: user.id });
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
        setHasLoadedOnce(true);
      }
    }
  }, [user?.id, teamsLoading, teamsError, teamLifecycle]);

  const refresh = useCallback(() => {
    requestChatUnreadRefresh();
  }, []);

  // Initial fetch, and again whenever the inputs to the rule change.
  useEffect(() => {
    void refreshNow();
  }, [refreshNow]);

  // Every throttled trigger lands here, including requestChatUnreadRefresh()
  // from the mark-read writers.
  useEffect(() => {
    const listener = () => {
      void refreshNow();
    };
    refreshListeners.add(listener);
    return () => {
      refreshListeners.delete(listener);
    };
  }, [refreshNow]);

  // Incoming messages. This is the fix for the simulator FAIL: the provider is
  // mounted above the navigator, so this fires on ANY tab with no background
  // round trip, and the same fetch updates both the row and the tab badge.
  useEffect(() => {
    if (!user?.id) return;
    const unsubscribe = subscribeToMessageInserts(() => requestChatUnreadRefresh());
    return unsubscribe;
  }, [user?.id]);

  // Mark-read landing on another device.
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`chat-unread-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'comm_channel_members',
          filter: `user_id=eq.${user.id}`,
        },
        () => requestChatUnreadRefresh()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  // Foreground: messages may have arrived, and a push may have written its own
  // number onto the app icon. Unthrottled -- this is a single user action.
  useEffect(() => {
    const onAppStateChange = (next: AppStateStatus) => {
      if (next === 'active') void refreshNow();
    };
    const subscription = AppState.addEventListener('change', onAppStateChange);
    return () => subscription.remove();
  }, [refreshNow]);

  return (
    <ChatUnreadContext.Provider
      value={{
        mainRows: rows.mainRows,
        pastRows: rows.pastRows,
        total: rows.total,
        loading,
        hasLoadedOnce,
        syncTick,
        refresh,
        refreshNow,
      }}
    >
      {children}
    </ChatUnreadContext.Provider>
  );
}

export function useChatUnread(): ChatUnreadValue {
  const context = useContext(ChatUnreadContext);
  if (context === undefined) {
    throw new Error('useChatUnread must be used within a ChatUnreadProvider');
  }
  return context;
}
