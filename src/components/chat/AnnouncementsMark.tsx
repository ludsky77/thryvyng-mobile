import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { MegaphoneIcon } from './MegaphoneIcon';
import { clubShortName } from '../../lib/clubAnnouncements';
import { ANN_NAVY, ANN_SKY } from '../../lib/announcementsTheme';

/**
 * ONE brand mark for the announcements chat — R-05 = A (Lu, 2026-11-04).
 *
 * WHY IT IS ONE COMPONENT. R-01 put a megaphone in the chat list's badge spot,
 * another in the feed header's 18pt circle and a third in the chat-room
 * header's — three copies of one idea, each with its own size, its own circle
 * and its own comment. A family moving list → feed → announcement saw three
 * different badges for the same chat, and none of them carried the CLUB. This
 * module is the single answer: the club's crest, ringed in the announcements
 * tan, with the megaphone as a small badge on the corner. Every layer renders
 * THIS, only smaller as it goes deeper.
 *
 * THREE PARTS, in order out from the middle:
 *   1. the crest — the club's `logo_url`, filling a circle. No `logo_url`
 *      falls back to the club's initials (`clubShortName`, R-01's own rule)
 *      on navy, never to a blank circle and never to an emoji.
 *   2. the ring — 2px of `ANN_SKY`, the pastel sky R-06 gives every
 *      announcements surface, and the colour of the card edges and the banner
 *      borders around it. It is what makes the mark read as announcements
 *      rather than as "a club".
 *   3. the megaphone badge — the existing `MegaphoneIcon`, `ANN_NAVY` on a
 *      sky circle, overlapping the bottom-right corner and ringed in the
 *      SCREEN'S background colour so it sits proud of the crest instead of
 *      merging into it. `ringColor` is that background and it is the one prop
 *      a caller must think about: it differs between a card (#1e293b) and a
 *      screen (#0f172a).
 *
 * R-06 (Lu, 2026-11-04) replaced the tan `#C4976D` this started in. The shape
 * did not change; only the two colours did, and they now come from
 * `lib/announcementsTheme` with every other announcements surface.
 *
 * NOTHING HERE READS THE DATABASE. The crest and the name are passed in, by
 * whichever screen already holds them (`lib/announcementsMarkClub` is the
 * shared read for the screens that do not).
 */

/**
 * The letters inside a crest-less circle.
 *
 * `clubShortName` is reused rather than re-derived — it is R-01's rule and the
 * same string the title says ("PAC Announcements") — but it is allowed to
 * return a whole short name ("Thryvyng FC", 11 characters), and a 32pt circle
 * holds about three letters. So a multi-word answer is initialled here.
 *
 * WITH NO CLUB NAME AT ALL it is "A", for the bare word "Announcements" that
 * `announcementsChatName` falls back to in exactly the same case. A cosmetic
 * gap, and the same cosmetic gap in both places.
 */
function markInitials(clubName: string | null | undefined): string {
  const short = clubShortName(clubName);
  if (!short) return 'A';
  const words = short.split(' ').filter(Boolean);
  if (words.length >= 2) {
    return words
      .map((w) => w.charAt(0))
      .join('')
      .slice(0, 3)
      .toUpperCase();
  }
  return short.slice(0, 3).toUpperCase();
}

export function AnnouncementsMark({
  size = 40,
  logoUrl,
  clubName,
  ringColor = '#0f172a',
}: {
  /** The crest circle's diameter. The badge and the letters scale off it. */
  size?: number;
  /** The club's `clubs.logo_url`. Null falls back to the initials. */
  logoUrl?: string | null;
  /** The club's full name — initialled for the fallback, never printed whole. */
  clubName?: string | null;
  /** The background the mark is drawn ON, for the badge's outer ring. */
  ringColor?: string;
}) {
  /*
   * The badge is a fixed FRACTION of the crest, with a 14pt floor: below that
   * the megaphone's three strokes stop being a megaphone. It overhangs by a
   * fifth of its own width on each of the two edges it touches, which is what
   * makes it read as a badge ON the crest rather than as a second circle
   * beside it.
   */
  const badge = Math.max(14, Math.round(size * 0.44));
  const overhang = -Math.round(badge * 0.2);
  /* The crest sits inside the 2px ring, so the image is 4pt smaller. */
  const inner = size - 4;

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <View
        style={[
          styles.crest,
          { width: size, height: size, borderRadius: size / 2 },
        ]}
      >
        {logoUrl ? (
          <Image
            source={{ uri: logoUrl }}
            style={{
              width: inner,
              height: inner,
              borderRadius: inner / 2,
            }}
            resizeMode="cover"
          />
        ) : (
          <Text
            style={[styles.initials, { fontSize: Math.round(size * 0.34) }]}
            numberOfLines={1}
          >
            {markInitials(clubName)}
          </Text>
        )}
      </View>
      <View
        style={[
          styles.badge,
          {
            width: badge,
            height: badge,
            borderRadius: badge / 2,
            right: overhang,
            bottom: overhang,
            borderColor: ringColor,
          },
        ]}
      >
        <MegaphoneIcon size={Math.round(badge * 0.62)} color={ANN_NAVY} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  /*
   * Sized to the CREST, not to the crest plus its badge: the mark has to line
   * up with a title or an avatar, and the badge's overhang is meant to break
   * that box. Nothing clips it — no `overflow: 'hidden'` on this wrap or on
   * any of its callers' rows.
   */
  wrap: {
    position: 'relative',
    flexShrink: 0,
  },
  crest: {
    borderWidth: 2,
    borderColor: ANN_SKY,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  initials: {
    color: '#f1f5f9',
    fontWeight: '800',
  },
  badge: {
    position: 'absolute',
    backgroundColor: ANN_SKY,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default AnnouncementsMark;
