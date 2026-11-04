/**
 * The club behind an announcements channel — ONE read, for the mark.
 *
 * WHY. `AnnouncementsMark` (R-05 = A) needs the club's `logo_url` and its
 * name on four screens. Two of them already hold both: the chat list gets
 * `club_logo_url` straight off `get_my_conversations`, and the chat-room
 * header reads them on a query it already makes. The other three — the feed,
 * one opened announcement, and compose — hold a channel id and, sometimes, a
 * club NAME passed down as a route param. Nobody was reading `logo_url`.
 *
 * Rather than let three screens grow three copies of the same two-step read
 * (the feed had already grown the first half of one, for its subtitle), this
 * module is the one place it happens, and the one place it is cached.
 *
 * THE CACHE IS PER PROCESS AND KEYED BY CHANNEL. A crest and a club name do
 * not change while the app is open, and list → feed → announcement → compose
 * is four mounts against one channel: without a cache that is four pairs of
 * requests for one picture. A miss costs the read; a hit paints the mark on
 * the first frame, which is the difference between a header that appears and
 * a header that pops.
 *
 * COSMETIC, END TO END. A failed read leaves whatever the caller seeded (a
 * club name from a route param, or nothing) and the mark falls back to its
 * initials. Nothing here decides which channel is opened — that is still
 * `channel_type = 'club' AND is_default` in `clubAnnouncements`, never a name
 * and never this module.
 */
import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { logError } from '../utils/logError';

/** What the mark and the draft key need, for one announcements channel. */
export interface AnnouncementsMarkClub {
  /** `comm_channels.club_id` — also the draft key's club half (F-2). */
  clubId: string | null;
  clubName: string | null;
  logoUrl: string | null;
}

const EMPTY: AnnouncementsMarkClub = {
  clubId: null,
  clubName: null,
  logoUrl: null,
};

/** channel id -> what we read for it. Per process; never persisted. */
const cache = new Map<string, AnnouncementsMarkClub>();

/**
 * The channel's club, from the server. `null` when the read failed, which a
 * caller must treat as "ask again later", NOT as "this channel has no club" —
 * the two are different and only the second may be cached.
 */
export async function fetchAnnouncementsMarkClub(
  channelId: string
): Promise<AnnouncementsMarkClub | null> {
  const { data: channel, error: channelError } = await supabase
    .from('comm_channels')
    .select('club_id')
    .eq('id', channelId)
    .maybeSingle();

  if (channelError) {
    logError('announcementsMarkClub.channel', channelError, { channelId });
    return null;
  }

  const clubId =
    (channel as { club_id?: string | null } | null)?.club_id ?? null;
  // A channel with no club is a real, cacheable answer: the mark shows its
  // initials fallback and no second request is made for it.
  if (!clubId) return EMPTY;

  const { data: club, error: clubError } = await supabase
    .from('clubs')
    .select('name, logo_url')
    .eq('id', clubId)
    .maybeSingle();

  if (clubError) {
    logError('announcementsMarkClub.club', clubError, { channelId, clubId });
    return null;
  }

  const row = club as { name?: string | null; logo_url?: string | null } | null;
  return {
    clubId,
    clubName: row?.name ?? null,
    logoUrl: row?.logo_url ?? null,
  };
}

/**
 * The club for this announcements channel, for a screen that must draw the
 * mark now and improve it when the read lands.
 *
 * `seed` is what the caller was handed by whoever navigated to it — a club
 * name, usually. It is used until the read answers and it is never overwritten
 * with null, so a successful hand-down followed by a failed read still reads
 * the right name.
 */
export function useAnnouncementsMarkClub(
  channelId: string | null | undefined,
  seed?: { clubName?: string | null; logoUrl?: string | null }
): AnnouncementsMarkClub {
  const [resolved, setResolved] = useState<AnnouncementsMarkClub | null>(() =>
    channelId ? cache.get(channelId) ?? null : null
  );

  useEffect(() => {
    if (!channelId) {
      setResolved(null);
      return;
    }
    const hit = cache.get(channelId);
    if (hit) {
      setResolved(hit);
      return;
    }
    let alive = true;
    (async () => {
      const club = await fetchAnnouncementsMarkClub(channelId);
      // A failed read is not cached and not applied: the seed keeps showing.
      if (!club) return;
      cache.set(channelId, club);
      if (alive) setResolved(club);
    })();
    return () => {
      alive = false;
    };
  }, [channelId]);

  return {
    clubId: resolved?.clubId ?? null,
    clubName: resolved?.clubName ?? seed?.clubName ?? null,
    logoUrl: resolved?.logoUrl ?? seed?.logoUrl ?? null,
  };
}
