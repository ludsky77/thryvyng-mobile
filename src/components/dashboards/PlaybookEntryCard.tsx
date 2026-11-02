import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { playbookVisible } from '../../constants/playbookLaunch';

/**
 * The PAC Playbook's dashboard door — one card, shared by every role dashboard
 * (fork PLAYBOOK-DASHBOARD-PLACEMENT, Nov 1 2026; restyled the same day, see
 * "the three design changes" below).
 *
 * It began as the card PLAYBOOK-CARD-INVITING built in `PlayerDashboard.tsx`,
 * lifted here so the player, coach and club-admin dashboards show the SAME door
 * instead of three copies of it. The other two ways in —
 * `src/screens/CoursesScreen.tsx` (the course list) and
 * `src/screens/ClubHubScreen.tsx` (the hub tile) — keep their own markup: they
 * are different SHAPES of the same feature, not the same card, and they are
 * outside this folder. See `docs/recon/playbook-polish.md`.
 *
 * WHERE IT SITS, on every dashboard: directly below the quick-nav tile grid
 * (`QuickActionsCard`), so the book is the first thing after navigation.
 *
 * THE SIGN IS SHARED, THE FRAME IS THE HOST'S — ruling ACCENT-A, Lu,
 * 2026-11-01 (PLAYBOOK-TYPE-PASS-E). The three doors into the book no longer
 * each style their own name: the SIGN — the green kicker `PAC PLAYBOOK`, the
 * book glyph, the tagline and the green cue — is identical in
 * `src/screens/CoursesScreen.tsx`, `src/screens/ClubHubScreen.tsx` and this
 * file, to the point, the weight and the ink. What stays HOST-SPECIFIC is the
 * frame: this card's rule is the dashboard's violet because it sits under the
 * violet tile grid, while the other two are green because their screens are.
 * The white `PAC Playbook` title is GONE from all three — the kicker carries
 * the name now, so the words appeared twice on every door.
 *
 * The sign's values are written out here, not imported, for the lazy-boundary
 * reason below. They are the book's own, and the file that owns them is
 * `src/features/pac-playbook/type.ts` (`role.labelAccent` for the kicker:
 * `fs.hitEyebrow` 11.5 at `ff.bold` with `capsWide` tracking, 11.5 × 0.08 =
 * 0.92, in `color.green`; `role.bodyLead`'s ink `chalk2` `#d7dde6` for the
 * tagline).
 *
 * THE THREE DESIGN CHANGES (Nov 1, second pass)
 * 1. the club's CREST replaces the book-icon disc on the left — see "the crest"
 *    below for where the image comes from;
 * 2. the `book-outline` glyph moved to the RIGHT of the title, small, so the
 *    book is still named by a picture now that the disc is the club's;
 * 3. the rule is the dashboard's VIOLET, not the playbook green — the exact
 *    value the quick-nav tiles use, so the door reads as part of the grid it
 *    sits under. The raised face is unchanged, and the cue and the chevron stay
 *    green, which is the one thread back to the book.
 *
 * THE CREST — the app's own club logo, not a new asset. `clubs.logo_url` is the
 * column every club badge in this app draws: the coach dashboard's emblem
 * (`CoachDashboard.tsx:328-339`, an `<Image>` with an initials circle behind
 * it) and the Playbook's own header; the chat list draws the same logo under
 * its RPC's own name, `club_logo_url` (`src/screens/ChatScreen.tsx:849`).
 *
 * It is read here through the `public_clubs` VIEW for the reason
 * `src/features/pac-playbook/rpc.ts:85-99` (`fetchClubCrest`) states: the view
 * is `security_invoker = false` and granted to `anon, authenticated`, so it
 * answers for a player and a parent exactly as it does for a director. It lists
 * approved clubs only, so an unapproved club returns no row — the same fallback
 * as a null logo, which is the lettering.
 *
 * WHICH club: the VIEWER's, and **the host dashboard hands it down** — every
 * one of the three already holds a club id:
 * `ClubAdminDashboard` its own `clubId` prop · `CoachDashboard` the team row's
 * `club_id` (`select('*')`, and its own nav calls already read it, `:456`) ·
 * `PlayerDashboard` the team's `club_id`. The Playbook's own header instead
 * shows the BOOK OWNER's crest (`usePlaybookBook.ts:182`,
 * `book.owner_club_id`); for a PAC user the two are one club, and for anyone
 * else they are not — see the tenant note below.
 *
 * WHY IT IS A PROP AND NOT `currentRole.club.id` — THE BUG THIS FIXES.
 * The first cut keyed the lookup on `useAuth().currentRole?.club?.id`, and on a
 * secondary-parent login the card drew the `PAC` lettering instead of the
 * crest. `AuthContext.tsx:92` sets `club` to `{ id, name }` OR to `null`, as
 * one unit, so a null `club` takes the id and the name together: the effect
 * returned early on `!clubId`, the `public_clubs` query NEVER RAN, and the
 * `<Image>` was never mounted — `onError` never fired either. The tell was the
 * rendered string: the initials branch is `substring(0, 2)`, two characters,
 * which can never spell `PAC`, so `PAC` could only be the `: 'PAC'` fallback,
 * which needs a falsy club name. Nothing in this app relies on
 * `currentRole.club` being populated — its only two other readers take it last
 * in an `||` chain (`RoleSwitcher.tsx:157`,
 * `WorldCupPredictorScreen.tsx:1101`) and the Playbook itself never reads it.
 * Whether `get_enriched_roles_v2` returns `club_id` for a parent row is UNKNOWN
 * from this repo (the function is server-side); it no longer matters here.
 *
 * The id still goes through `public_clubs` rather than a `clubs` join in the
 * host, deliberately: the coach dashboard's join can read `clubs.logo_url`
 * (`CoachDashboard.tsx:96`) but a player's and a parent's may not — the view
 * exists precisely because direct `clubs` reads do not answer for them
 * (`rpc.ts:85-99`). A team row's plain `club_id` column reads for everyone, so
 * that is what the hosts pass. One lookup, one RLS story, every role.
 *
 * NOT TENANT-SCOPED, and this card does not change that: `playbookVisible` is a
 * plain module constant with no club in it (`src/constants/playbookLaunch.ts`),
 * the `Playbook` route is gated on the same constant and nothing else
 * (`AppNavigator.tsx:349`), and the book is fetched by SLUG — `fetchBook()`
 * does `.eq('slug', 'pac-playbook')` and nothing ever compares its
 * `owner_club_id` to the viewer's club (`rpc.ts:45,77-83`). So a non-PAC
 * tenant's user sees this PAC-branded card too. Reported, not fixed: the fix is
 * a gate change, which this task forbids.
 *
 * THE LAZY BOUNDARY HOLDS. Nothing here imports from
 * `src/features/pac-playbook/`: a dashboard is a boot path, and importing the
 * feature would put the book's module graph in its bundle. The book is reached
 * only through the `Playbook` route's own `lazy()` (`AppNavigator.tsx:88`). So
 * every value borrowed from the feature is written out BY VALUE with a citation
 * beside it, exactly as the three entry points already do — card2 `#1c2637`
 * (`src/features/pac-playbook/theme.ts:65`), green `#10b981` (`theme.ts:81`)
 * and `lineWidth.mid` `1.5` (`theme.ts:310`). Those three line numbers were
 * re-checked this pass: M6's font work moved them, so the citations the earlier
 * entry points carry (`theme.ts:63,79,81` and `:255`) now point at the wrong
 * lines — the VALUES are unchanged. `fetchClubCrest` is copied the
 * same way, as four lines of query, for the same reason. If the colours ever
 * drift, the grep that finds every copy is
 * `grep -rn "#1c2637\|#10b981" src/`.
 *
 * THE GATE. `playbookVisible` is read once, here, and the card renders nothing
 * when it is false — the same gate the dashboard card has always carried, in
 * one place instead of three, so a new dashboard cannot forget it. The switch
 * itself is untouched.
 *
 * The section wrapper and its title are the HOST dashboard's, not this file's:
 * `styles.section` and `styles.sectionTitle` differ per dashboard (padding 12
 * vs 16, a grey title on the player and admin dashboards, violet on the
 * coach's), and the door should match the sections around it.
 */
export default function PlaybookEntryCard({
  navigation,
  clubId,
  clubName,
}: {
  navigation: any;
  /** The host dashboard's club. Null means no crest lookup — the lettering. */
  clubId: string | null;
  /** Optional, for the lettering before the crest lands. */
  clubName?: string | null;
}) {
  const [crest, setCrest] = useState<{
    name: string | null;
    logo: string | null;
  } | null>(null);
  // A logo_url that 404s falls back to the lettering, the way the Playbook
  // header's own crest does (`PlaybookHeader.tsx:49-65`).
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setCrest(null);
    setBroken(false);
    if (!playbookVisible || !clubId) return;
    let cancelled = false;
    supabase
      .from('public_clubs')
      .select('name, logo_url')
      .eq('id', clubId)
      .maybeSingle()
      .then(({ data }) => {
        const row = data as { name?: string | null; logo_url?: string | null } | null;
        if (cancelled || !row) return;
        setCrest({ name: row.name ?? null, logo: row.logo_url ?? null });
      });
    return () => {
      cancelled = true;
    };
  }, [clubId]);

  if (!playbookVisible) return null;

  const crestUrl = crest?.logo ?? null;
  // The view's own name once it lands, the host's until then.
  const name = crest?.name ?? clubName ?? null;
  const showCrest = !!crestUrl && !broken;
  // The coach dashboard's own fallback, two letters upper-cased
  // (`CoachDashboard.tsx:336`); `PAC` when there is no club name to shorten,
  // which is the Playbook header's fallback (`PlaybookHeader.tsx:62`).
  const initials = name ? name.substring(0, 2).toUpperCase() : 'PAC';

  return (
    <TouchableOpacity
      style={styles.playbookCard}
      onPress={() => navigation.navigate('Playbook')}
      activeOpacity={0.8}
    >
      {/* The club's crest, the badge the rest of the app draws from the same
          column. */}
      <View style={styles.playbookCrest}>
        {showCrest ? (
          <Image
            source={{ uri: crestUrl as string }}
            style={styles.playbookCrestImg}
            resizeMode="contain"
            onError={() => setBroken(true)}
          />
        ) : (
          <Text style={styles.playbookCrestText}>{initials}</Text>
        )}
      </View>
      <View style={styles.playbookCardText}>
        {/* THE SIGN, line one — the book's mark and its name, as a green
            kicker. The glyph stays beside the kicker here because this door's
            disc is the CLUB's crest; on the other two doors the glyph sits in
            the disc the host gives it. One glyph per door, same green. */}
        <View style={styles.playbookTitleRow}>
          <Ionicons name="book-outline" size={14} color="#10b981" />
          <Text style={styles.playbookKicker}>PAC Playbook</Text>
        </View>
        {/* THE SHARED TAGLINE — the cover's own opening words
            (src/features/pac-playbook/screens/CoverScreen.tsx:139). It is the
            door's headline now that the kicker carries the name. */}
        <Text style={styles.playbookDesc}>
          How we see the game, how we play it and how we think
        </Text>
        {/* The cue lost its `›`: the chevron on the right is this card's one
            tap cue, and the arrow said it twice. */}
        <Text style={styles.playbookOpen}>Open the book</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#10b981" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  // A RAISED FACE inside a VIOLET RULE. The face is the book's `color.card2`
  // `#1c2637` (`theme.ts:65`) at the book's `lineWidth.mid` `1.5`
  // (`theme.ts:310`) — the QUIZ-CARD-NOTICEABLE device, kept. The rule's
  // COLOUR is no longer the playbook green: it is `rgba(139, 92, 246, 0.4)`,
  // the exact border the quick-nav tiles above this card use
  // (`src/components/QuickActionsCard.tsx:108`, `styles.buttonBorder`), so the
  // door belongs to the grid it sits under. Only the colour was matched — the
  // tiles rule at `borderWidth: 1`, this card keeps its 1.5.
  playbookCard: {
    backgroundColor: '#1c2637',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(139, 92, 246, 0.4)',
  },
  // The crest disc: the dashboard emblem's 40pt circle
  // (`CoachDashboard.tsx:629-633`) on a white face with a violet ring, so a
  // logo of any colour reads against it.
  playbookCrest: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  playbookCrestImg: {
    width: '100%',
    height: '100%',
    padding: 2,
  },
  // The lettering behind a missing logo — the app's violet `#8b5cf6`
  // (`CoachDashboard.tsx:638`) on the white disc.
  playbookCrestText: {
    color: '#8b5cf6',
    fontSize: 13,
    fontWeight: '700',
  },
  playbookCardText: {
    flex: 1,
  },
  playbookTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
  },
  // THE SIGN'S KICKER — ruling ACCENT-A, identical on all three doors. The
  // book's own green eyebrow, by value: `role.labelAccent` at
  // `fs.hitEyebrow` (`src/features/pac-playbook/type.ts`) — 11.5pt, 700,
  // `capsWide` tracking (11.5 × 0.08 = 0.92), uppercase, `color.green`
  // `#10b981`. `fontWeight` and not a face: Archivo is loaded by the book and
  // only by the book (`font.ts`), so a door asking for it would get the
  // system font silently.
  playbookKicker: {
    color: '#10b981',
    fontSize: 11.5,
    fontWeight: '700',
    letterSpacing: 0.92,
    textTransform: 'uppercase',
  },
  // THE SIGN'S TAGLINE, and the door's headline. `color.chalk2` `#d7dde6`
  // (theme.ts) — the three doors each had their own grey before this
  // (`#888` here, `#9CA3AF` on Courses, `#64748b` on Club Hub).
  playbookDesc: {
    color: '#d7dde6',
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 20,
  },
  // The shared cue, still the playbook green — with the rule now violet, this
  // and the chevron are the card's only green.
  playbookOpen: {
    color: '#10b981',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
  },
});
