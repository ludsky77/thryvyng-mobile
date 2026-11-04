/**
 * THE ANNOUNCEMENTS COLOUR SYSTEM — R-06, option 2 (Lu, 2026-11-04).
 *
 * WHAT CHANGED. R-01 and R-05 built the announcements surfaces in the tan
 * `#C4976D`, which was never a decision: it is what
 * `ChatScreen.getChannelColor` has always returned for a `club` channel, and
 * the mark, the rules, the kicker and the card edges inherited it one at a
 * time. Lu ruled **option 2 — a pastel sky with a soft tint** — so the chat
 * every family in the club reads reads as its own surface rather than as a
 * brown accent borrowed from a colour table.
 *
 * WHY THE TOKENS LIVE IN THEIR OWN MODULE. Eight files draw part of this
 * surface, and before R-06 the accent was written out by hand in five of them.
 * A colour defined in five places is a colour that drifts on the sixth change.
 * These five constants are the whole system; nothing else chooses a colour for
 * an announcements surface, and NOTHING here is read from the server.
 *
 * IT IS PURE ON PURPOSE — no `supabase`, no react, no component import. That
 * is what lets `NotificationsScreen` take a token without pulling the
 * announcements data layer in behind it.
 *
 * ANNOUNCEMENTS ONLY. No team colour is touched: `resolveTeamColor` is still
 * the one rule for a team's own colour, and `getChannelColor`'s other arms —
 * a DM, a group chat, the coaches' lounge, any future club channel — are
 * unchanged and still tan or purple. The ONE arm that now returns
 * `ANN_SKY` is gated on `isAnnouncements`, the row test
 * (`channel_type = 'club' AND is_default`), so no other chat can reach it.
 */

/**
 * The accent: crest rings, the megaphone's circle, card edges, the small-caps
 * kicker, the banner borders, and F-3's dashed draft border.
 */
export const ANN_SKY = '#A9CCEB';

/**
 * The fill: the chat list's announcements card, and the banner at the top of
 * the feed, one opened announcement and compose.
 *
 * It is a TINT and not a solid — 22% of the accent over whatever navy it sits
 * on — so one value works on the list's `#1e293b` card bed and on the
 * screens' `#0f172a` without a second token for each.
 */
export const ANN_SKY_TINT = 'rgba(169,204,235,0.22)';

/** Primary text on the tinted fill. */
export const ANN_TEXT = '#FFFFFF';

/** Secondary text on the tinted fill — a preview line, a club name, a date. */
export const ANN_SUBTEXT = '#C7DDF2';

/**
 * The dark the accent is read AGAINST: the megaphone drawn on the sky circle,
 * and the unread count drawn on a sky badge.
 *
 * It exists because the alternative is unreadable, not for decoration. White
 * on `#A9CCEB` is about 1.4:1 — the pastel is light enough that anything drawn
 * ON it has to be dark, which is the one thing a tan accent did not have to
 * think about.
 */
export const ANN_NAVY = '#0F1D2F';
