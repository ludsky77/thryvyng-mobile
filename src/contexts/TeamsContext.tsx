/**
 * One fetch of the user's teams for the whole app.
 *
 * useUserTeams runs five queries. Before Stone B, ChatScreen and CalendarScreen
 * each ran their own copy when mounted; the Stone B build then added a third
 * from useTotalChatUnread, which lives in MainTabs and so fetched on every app
 * start. This provider calls useUserTeams exactly once, above the navigator,
 * and hands the same value to everyone inside it.
 *
 * The hook itself is untouched -- CalendarScreen and CalendarSyncModal still
 * call useUserTeams() directly and behave exactly as they did. Only the two
 * consumers that need the unread rule's team_status (useTotalChatUnread and
 * ChatScreen) read from here.
 */

import React, { createContext, useContext, ReactNode } from 'react';
import { useUserTeams } from '../hooks/useUserTeams';

type SharedUserTeams = ReturnType<typeof useUserTeams>;

const TeamsContext = createContext<SharedUserTeams | undefined>(undefined);

export function TeamsProvider({ children }: { children: ReactNode }) {
  // The single mount. Everything below reads this value.
  const value = useUserTeams();
  return <TeamsContext.Provider value={value}>{children}</TeamsContext.Provider>;
}

/**
 * The shared useUserTeams result. Identical shape to calling the hook, so a
 * consumer can swap one for the other without touching anything else.
 */
export function useSharedUserTeams(): SharedUserTeams {
  const context = useContext(TeamsContext);
  if (context === undefined) {
    throw new Error('useSharedUserTeams must be used within a TeamsProvider');
  }
  return context;
}
