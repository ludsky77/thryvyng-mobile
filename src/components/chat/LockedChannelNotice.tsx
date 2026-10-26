import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { ANNOUNCEMENT_BANNER_MESSAGE } from '../../lib/announcementChannel';

/**
 * The notice that REPLACES the composer in a chat only staff may post in.
 *
 * Ruling R5 (Lu, 2026-10-23): when the channel has `allow_member_text === false`
 * and the current user is NOT channel staff, the composer is replaced by a
 * notice -- a club channel and a team channel each get their own sentence, both
 * declared below and NOWHERE else. Reactions stay available; staff see the
 * normal composer.
 *
 * This is the HONEST UI for an enforcement that already exists: the `msg_insert`
 * policy on `comm_messages` requires `channel_allows_member_text(channel) OR
 * is_channel_staff(channel, auth.uid())`, so a non-staff send in a locked chat is
 * refused by the server whatever this app shows. Nothing here is the rule -- the
 * predicate is `canSendText` in `../../lib/announcementChannel`, and the staff
 * answer behind it is the server's own `is_channel_staff` (see
 * `../../lib/channelStaff.ts`).
 *
 * ONE component owns all three sentences, so no screen can print a fourth.
 *
 * WHY THE THIRD SENTENCE IS STILL HERE. R5 named the club chat and the team
 * chat. A GROUP chat (`channel_type = 'group_dm'`) can also be switched to
 * announcement-only and no ruling covers its wording, so that case keeps the
 * sentence it prints today -- `ANNOUNCEMENT_BANNER_MESSAGE`, which is declared
 * byte-identical with the web app on purpose (COMMS PARITY, see
 * `announcementChannel.ts`). Overwriting it here would have silently broken that
 * parity for a chat kind the ruling did not mention.
 */

/** R5's wording for a club's own chat. */
export const CLUB_LOCKED_NOTICE = 'Only club admins can post here';
/** R5's wording for a team chat. */
export const TEAM_LOCKED_NOTICE = 'Only team staff can post here';

/**
 * Which sentence a chat kind gets. `'default'` is the other value the server
 * gives a default TEAM chat (see `showsClubCrest` in `../../lib/chatHelpers.ts`),
 * so it answers with the team sentence rather than falling through.
 */
export function lockedNoticeFor(
  channelKind: string | null | undefined
): string {
  if (channelKind === 'club') return CLUB_LOCKED_NOTICE;
  if (channelKind === 'team' || channelKind === 'default') {
    return TEAM_LOCKED_NOTICE;
  }
  return ANNOUNCEMENT_BANNER_MESSAGE;
}

interface LockedChannelNoticeProps {
  /** The channel ROW's `channel_type`, never a route param or a derived label. */
  channelKind?: string | null;
}

export function LockedChannelNotice({ channelKind }: LockedChannelNoticeProps) {
  return (
    <View style={styles.notice}>
      <Feather name="volume-2" size={18} color="#F59E0B" />
      <Text style={styles.noticeText}>{lockedNoticeFor(channelKind)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Amber icon and muted text, the same read as web's banner (a Megaphone on
  // bg-muted/50). Lifted verbatim from ChatInputBar's `announcementBanner`, which
  // this replaces.
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  noticeText: {
    flex: 1,
    color: '#9CA3AF',
    fontSize: 13,
  },
});
