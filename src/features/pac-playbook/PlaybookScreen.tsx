/**
 * The reader — one shell, one screen state, the prototype's go() / render_()
 * (:1160-1204) as a component. The mobile counterpart of the web's
 * `PlaybookReader.tsx` (`thrive-and-score` @ `c772111`).
 *
 * RULING R-2: there is one route. Which screen is open lives in THIS component
 * and not in the navigator — the back label, the trail, the search return and
 * the quiz return are all one state machine, and splitting them across six
 * navigator screens would mean six places that can disagree about where
 * "back" goes. Only the open CARD is a route param, `card`, the way the web
 * puts it in `?card=`; `linking.ts` already types it as
 * `Playbook: { card?: string }`.
 *
 * RULING R-1: with no player chosen this is a READ-ONLY BOOK — the cover, the
 * contents, the chapters, the cards and the search; no progress, no "Got it",
 * no quiz, no questions. That is not enforced here, it is simply not rendered,
 * and the server would refuse every one of those writes anyway (P0041).
 *
 * RULING R-4: the player is the current role's `entity_id` and nothing else,
 * and the parent's "do it together" note comes from `playbook_viewer_kind()`.
 *
 * RULING E-R4 = A: the EN/ES toggle lives in `usePlaybookLangState` here, not
 * in an app-wide setting — `strings.tsx` carries the reasoning.
 *
 * FOUR THINGS THE MOBILE SHELL DOES DIFFERENTLY, each for a platform reason:
 *
 *  1. **The scroller is real.** The web's `.scr` is a flex column inside a
 *     page that scrolls; here it is a `ScrollView`, and `scrollTo({y: 0})`
 *     replaces `window.scrollTo`. The doodle bands are its first and
 *     second-to-last children, which is what the web's flex `order` achieves.
 *  2. **The header is a sibling, not sticky.** Above the `ScrollView`, so it
 *     cannot scroll away. Same result, simpler means.
 *  3. **The footer is inline.** `position:sticky` has no RN equivalent and a
 *     screen owns its own `.cta`; the order on screen is unchanged. Recorded
 *     as PLAYBOOK-MOBILE-CTA-NOT-STICKY.
 *  4. **The font is registered, not injected.** The web injects an Archivo
 *     <link> from the route's own chunk (`loadPlaybookFont`); M6 revisited
 *     ruling E-R3 and mobile now registers the same four faces from bundled
 *     `.ttf`s through `expo-font`. `font.ts` holds the how and the why; the
 *     root below holds the one frame it can cost.
 *
 * THE LAZY RULE (§ E3) HOLDS: nothing in this folder is imported from the root
 * layout, a tab layout or a provider. In M3 the only way in is the `__DEV__`
 * harness; M4 gives it a route and proves the boundary.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { DoodleBand } from './Doodles';
import { usePlaybookFont } from './font';
import { doodlePlan, strengthPreset, STRENGTH, type DoodleScreen } from './doodleArt';
import { PlaybookHeader, type HeaderBack } from './PlaybookHeader';
import { CoverScreen } from './screens/CoverScreen';
import { ContentsScreen } from './screens/ContentsScreen';
import { TeamProgressScreen } from './screens/TeamProgressScreen';
import { PlayerProgressScreen } from './screens/PlayerProgressScreen';
import { InboxScreen } from './screens/InboxScreen';
import { ThreadScreen } from './screens/ThreadScreen';
import { MessagesScreen } from './screens/MessagesScreen';
import { fetchQuestionWhere, fetchStaffInbox, type InboxRow } from './coachRpc';
import { useStaffTrack, type OfflineStaff } from './useStaffTrack';
import { useMyMessages, type OfflineMessages } from './useMyMessages';
import { ChapterScreen } from './screens/ChapterScreen';
import { CardScreen } from './screens/CardScreen';
import { ChapterEndScreen } from './screens/ChapterEndScreen';
import { QuizScreen } from './screens/QuizScreen';
import {
  PlaybookLangProvider,
  pick,
  usePlaybookLangState,
  useLang,
  type Lang,
} from './strings';
import { usePlaybookBook, type OfflineBook } from './usePlaybookBook';
import { usePlaybookProgress, type OfflineProgress } from './usePlaybookProgress';
import { useQuizRun, type OfflineQuiz } from './useQuizRun';
import type { Card, QuestionRow, ReplyRow } from './types';
import { Btn } from './ui';
import { pbk } from './styles';
import { color } from './theme';

/** The roles whose `entity_id` is a player id (`PlayerDashboard.tsx`). */
const PLAYER_ROLES = ['player', 'parent'];

type Nav =
  | { screen: 'cover' }
  | { screen: 'home' }
  | { screen: 'chapter'; ch: string }
  | { screen: 'card'; id: string }
  | { screen: 'chend'; ch: string }
  | { screen: 'quiz' }
  /* The coach track — PLAYBOOK-COACH-TRACK-MOBILE. Four more screens on the
     ONE route (ruling R-2): the book never gained a navigator entry and does
     not gain four now. `thread` carries the whole inbox row because the list
     already loaded it; nothing is fetched twice to open a thread. */
  | { screen: 'progress' }
  | { screen: 'player'; id: string }
  | { screen: 'inbox' }
  | { screen: 'thread'; q: InboxRow }
  /* The family's own messages across every chapter — PLAYBOOK-COVER-POLISH,
     FAMILY-MESSAGES-ON-COVER. Still the ONE route (R-2); the door is on the
     cover and a tap from here opens the chapter's existing questions screen,
     so this screen owns no thread of its own. */
  | { screen: 'messages' };

/**
 * Everything the `__DEV__` harness injects so the reader can be opened with no
 * session: the whole book, a progress set, a dealt quiz and a question thread.
 * Undefined on the real route, where every one of these comes from the server.
 */
/**
 * THE AGENT'S LOOK — harness-only, and `undefined` on the real route.
 *
 * `initialNav` exists because a simulator cannot be tapped from a shell (see
 * its own note below). The two interactive boards added on 2026-11-02 moved
 * that problem one level down: a figure's 4th tab (PLAYBOOK-DIAGRAM-TABS) and
 * the keeper board's second mode and its presets (PLAYBOOK-KEEPER-ANGLE) are
 * all reached by PRESSING something, so without this they could be built and
 * never photographed.
 *
 * It is an INITIAL state and nothing more: each field seeds the state the
 * component would otherwise start at, and every control still works normally
 * afterwards. Nothing in the app sets it, and no behaviour depends on it being
 * absent.
 */
export interface PlaybookLook {
  /** 1-based frame a tabbed figure opens on. Out of range is clamped. */
  tab?: number;
  /** Which mode the keeper board opens in. */
  keeperMode?: 'watch' | 'you';
  /** Which preset the keeper board's ball starts on, by id. */
  keeperBall?: string;
}

export interface PlaybookOffline {
  book: OfflineBook;
  progress?: OfflineProgress;
  quiz?: OfflineQuiz;
  questions?: { questions: QuestionRow[]; replies: ReplyRow[] };
  /** A player id to stand in for `currentRole.entity_id`. */
  playerId?: string | null;
  /** The `__DEV__` `?dz=` strength preview, as a query string. */
  dz?: string;
  /** Open already in this language; the header toggle still moves it. */
  lang?: Lang;
  /**
   * Which screen to open on. The real route opens on the cover, always; the
   * harness needs to land on any of the six, because the simulator this is
   * looked at on has no way to tap (`xcrun simctl` has no tap verb and neither
   * `idb` nor `cliclick` is installed on this machine), so every screen is
   * reached by deep link instead. `go()` is NOT used for it — this is the
   * initial state, and the trail, the search flag and the scroll position are
   * all at their defaults, exactly as they are on the cover.
   */
  initialNav?: Nav;
  /** A search term already typed, so the results body can be looked at. */
  initialQuery?: string;
  /** Start the quiz on mount, so its run and result phases can be seen. */
  autoStartQuiz?: boolean;
  /**
   * Scroll this far down once the screen is laid out. Same reason as
   * `initialNav`: there is no way to swipe a simulator from a shell, and a
   * board that sits below the fold would otherwise go unlooked-at.
   */
  initialScrollY?: number;
  /** Seeds the two interactive boards — see `PlaybookLook`. */
  look?: PlaybookLook;
  /** The harness's staff roster and inbox — PLAYBOOK-COACH-TRACK-MOBILE. */
  staff?: OfflineStaff | null;
  /** The harness's family messages and a pretend last-look timestamp. */
  messages?: OfflineMessages | null;
}

export interface PlaybookScreenProps {
  /** The web's `?card=`; `linking.ts` types it as `Playbook: { card?: string }`. */
  card?: string;
  /**
   * A PUSH TAP — PLAYBOOK-COACH-TRACK-MOBILE, push types `playbook_question`
   * and `playbook_answer` (migration :819, :892).
   *
   * `question` is the row's id and `questionMode` says which side tapped:
   * `inbox` lands a coach on the thread, `family` lands the asker on their own
   * messages — which live on the END-OF-CHAPTER screen, so the chapter is
   * looked up from the question itself. Both fall back to the contents screen
   * rather than to a blank one if the row cannot be read (it was deleted, or
   * the tapper is no longer staff for that player).
   */
  question?: string;
  questionMode?: 'inbox' | 'family';
  /**
   * Leave the book and go back to whatever opened it — the dashboard card,
   * the Courses featured card or the Club Hub card (Lu, Oct 27: "back/home at
   * every point"). The ROUTE owns this, not the reader: the navigator hands
   * down its own `goBack`, so the reader never imports react-navigation and
   * the `__DEV__` harness, which has nowhere to go back to, simply omits it.
   * Drawn as a chevron on the cover's header only; every other screen already
   * has the in-book back in that spot.
   */
  onExit?: () => void;
  offline?: PlaybookOffline;
}

export default function PlaybookScreen(props: PlaybookScreenProps) {
  // The reader opens in English and the header's EN/ES moves it (E-R4 = A).
  // `offline.lang` is the harness's way to open it already in Spanish, since a
  // simulator cannot be tapped from a shell.
  const langState = usePlaybookLangState(props.offline?.lang ?? 'en');

  // Archivo, for this route only (`font.ts`). The gate is HERE, above the
  // header, because every style in the book now names a face and none names a
  // weight — so text painted before the faces register would paint in the
  // system font and then jump. The placeholder is the page colour and NO TEXT,
  // which is the one thing that cannot flash.
  //
  // It costs at most one frame, and only on the first open of an app session:
  // `useFonts` seeds its own state from a synchronous `isLoaded` check
  // (`expo-font/src/FontHooks.ts`), so every later open is already `ready` on
  // the first render. Nothing outside this route mounts the hook, so app open
  // never waits on it — the standing performance ruling.
  const font = usePlaybookFont();
  if (!font.ready) return <View style={pbk.page} />;

  return (
    <PlaybookLangProvider value={langState}>
      <Reader {...props} />
    </PlaybookLangProvider>
  );
}

function Reader({
  card: cardParam,
  question: questionParam,
  questionMode,
  onExit,
  offline,
}: PlaybookScreenProps) {
  const { currentRole } = useAuth();
  const { lang, t } = useLang();
  const es = lang === 'es';
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);

  const playerId = offline
    ? (offline.playerId ?? null)
    : currentRole && PLAYER_ROLES.includes(currentRole.role)
      ? (currentRole.entity_id as string)
      : null;

  const { content, crest, blocks, blocksReady, loading, error, needBlocks, reload } =
    usePlaybookBook(offline?.book);
  const bookId = content?.book.id || null;
  const progress = usePlaybookProgress(playerId, bookId, lang, offline?.progress);
  const quiz = useQuizRun(playerId, bookId, lang, offline?.quiz);

  /**
   * THE COACH TRACK's one load. Gated on the book being open so a reader who
   * never reaches the contents screen never asks the server whether they are
   * staff. A family-only account gets an empty roster and nothing is drawn
   * (ruling R1); `canAnswer` is the separate gate that hides the inbox row
   * from a team manager (ruling R2).
   */
  const staff = useStaffTrack(!!content, offline?.staff);

  /**
   * THE FAMILY'S MESSAGES — FAMILY-MESSAGES-ON-COVER. Gated on a player, so a
   * staff-only reader never makes the call: `playerId` is the role's own
   * `entity_id` (R-4), which only a player or a parent has. One load per
   * reader, like the staff track's, and its empty answer hides the block.
   */
  const messages = useMyMessages(playerId, !!content, offline?.messages);

  const [nav, setNav] = useState<Nav>(offline?.initialNav ?? { screen: 'cover' });
  const [trail, setTrail] = useState<string[]>([]);
  const [fromSearch, setFromSearch] = useState(false);
  const [query, setQuery] = useState(offline?.initialQuery ?? '');
  const [focusSearch, setFocusSearch] = useState(false);
  const [quizReturn, setQuizReturn] = useState(false);
  const [gotError, setGotError] = useState<string | null>(null);
  const [deepLinkDone, setDeepLinkDone] = useState(false);

  // Stable identities: `content?.cards || []` is a fresh array every render,
  // which would re-key every memo and callback below it.
  const cards = useMemo(() => content?.cards || [], [content]);
  const chapters = useMemo(() => content?.chapters || [], [content]);
  const cardsByKey = useMemo(() => new Map(cards.map((c) => [c.key, c])), [cards]);
  const chaptersByKey = useMemo(() => new Map(chapters.map((c) => [c.key, c])), [chapters]);
  const cardsOf = useCallback(
    (chapterKey: string) => cards.filter((c) => c.chapter_key === chapterKey),
    [cards]
  );

  /** :408 — the first card nobody has ticked, else the first card. */
  const nextUnread = useCallback((): Card | null => {
    if (!cards.length) return null;
    for (const ch of chapters) {
      const c = cardsOf(ch.key).find((x) => !progress.got.has(x.id));
      if (c) return c;
    }
    return cards[0];
  }, [cards, chapters, cardsOf, progress.got]);

  /* ------------------------------------------------------- the route param */

  // One-time: a `card` param opens that card. The web writes the param back as
  // you page through a chapter; a navigator param is not a URL, so the reader
  // only READS it — `setParams` on every card would push navigator state the
  // hardware back button would then have to unwind, which is the same reason
  // the web uses `{ replace: true }`.
  useEffect(() => {
    if (deepLinkDone || !cards.length) return;
    if (cardParam && cardsByKey.has(cardParam)) setNav({ screen: 'card', id: cardParam });
    setDeepLinkDone(true);
  }, [deepLinkDone, cards.length, cardsByKey, cardParam]);

  /**
   * A PUSH TAP on a question — PLAYBOOK-COACH-TRACK-MOBILE.
   *
   * Two destinations, because the two pushes have two audiences (R3 / R4):
   *
   *   `inbox`  a coach tapped "new question". The row is found by asking the
   *            inbox for everything and matching the id — the same RPC the
   *            list screen uses, so the tap cannot open a thread the server
   *            would not have listed.
   *   `family` the asker tapped "your coach replied". Their messages live on
   *            the end-of-chapter screen, and the push carries no chapter, so
   *            the question's own row is read for it.
   *
   * Either way a failure lands on the contents screen rather than nowhere:
   * the row may have been deleted, or the tapper may no longer be staff for
   * that player, and neither is worth a dead end. It runs once.
   */
  const [questionDone, setQuestionDone] = useState(false);
  useEffect(() => {
    if (questionDone || !questionParam || !content || offline) return;
    setQuestionDone(true);
    let gone = false;
    (async () => {
      try {
        if (questionMode === 'inbox') {
          const all = await fetchStaffInbox('all');
          const row = all.find((q) => q.question_id === questionParam);
          if (!gone && row) {
            setNav({ screen: 'thread', q: row });
            return;
          }
        } else {
          const where = await fetchQuestionWhere(questionParam);
          const ch = where ? chapters.find((c) => c.id === where.chapter_id) : null;
          if (!gone && ch) {
            setNav({ screen: 'chend', ch: ch.key });
            return;
          }
        }
        if (!gone) setNav({ screen: 'home' });
      } catch (e) {
        console.warn('playbook: question deep link failed', e);
        if (!gone) setNav({ screen: 'home' });
      }
    })();
    return () => {
      gone = true;
    };
  }, [questionDone, questionParam, questionMode, content, chapters, offline]);

  /* ------------------------------------------------------------ navigation */

  const go = useCallback((next: Nav, keepTrail = false, keepSearch = false) => {
    if (!keepTrail) setTrail([]);
    if (!keepSearch && !keepTrail) setFromSearch(false);
    setGotError(null);
    setNav(next);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []);

  const openCard = useCallback((key: string) => go({ screen: 'card', id: key }), [go]);

  /** :1162 — a green chip pushes the card you were on, so you can come back. */
  const followLink = useCallback(
    (key: string) => {
      setTrail((prev) => (nav.screen === 'card' ? [...prev, nav.id] : prev));
      go({ screen: 'card', id: key }, true);
    },
    [nav, go]
  );

  const trailBack = useCallback(() => {
    setTrail((prev) => {
      const next = prev.slice();
      const id = next.pop();
      if (id) go({ screen: 'card', id }, true);
      return next;
    });
  }, [go]);

  // HARNESS ONLY: `autoStartQuiz`, so the run and result phases are reachable
  // on a simulator with no tap. Fires once, and only with `offline` set.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!offline?.autoStartQuiz || autoStarted.current) return;
    if (nav.screen !== 'quiz' || !content) return;
    autoStarted.current = true;
    quiz.start();
  }, [offline?.autoStartQuiz, nav.screen, content, quiz]);

  // HARNESS ONLY: land the look where the board is. One shot, after layout.
  useEffect(() => {
    const y = offline?.initialScrollY;
    if (!y) return;
    const id = setTimeout(() => scrollRef.current?.scrollTo({ y, animated: false }), 600);
    return () => clearTimeout(id);
  }, [offline?.initialScrollY, nav]);

  // The card screen needs the diagram blocks; the contents screen does not.
  useEffect(() => {
    if (nav.screen === 'card' || nav.screen === 'quiz') needBlocks();
  }, [nav, needBlocks]);

  const onGotIt = useCallback(
    async (c: Card, value: boolean) => {
      setGotError(null);
      const msg = await progress.markGotIt(c.id, value);
      if (msg) setGotError(msg);
    },
    [progress]
  );

  /**
   * End-of-chapter is the player's screen (questions & notes). A staff viewer
   * reading the last card of a chapter goes back to that chapter's list
   * instead of to an empty one (R-1).
   */
  const openEnd = useCallback(
    (chapterKey: string) =>
      playerId
        ? go({ screen: 'chend', ch: chapterKey })
        : go({ screen: 'chapter', ch: chapterKey }),
    [playerId, go]
  );

  /* ------------------------------------------------------------- the states */

  /**
   * Loading and error wear the header too — Lu, Oct 30. They used to render
   * bare, above the tab bar and nothing else, so a book that would not open
   * left the reader with no way back to where it was opened from. They now
   * carry the same chrome as the cover: the crest, `PAC Playbook` and the
   * chevron, in the header's single row. There is no book yet, so there is no
   * subtitle and no search or home — the header draws neither when it is
   * handed null, and it drops the subtitle line when it is empty.
   *
   * `topInset` goes to the header rather than to the page, as on every other
   * screen, so the gradient runs under the status bar instead of starting
   * below it.
   */
  const stateFrame = (children: React.ReactNode) => (
    <View style={pbk.page}>
      <View style={pbk.col}>
        <PlaybookHeader
          title="PAC Playbook"
          sub=""
          back={null}
          onExit={onExit}
          crestUrl={crest?.logo_url}
          crestAlt={crest?.name}
          topInset={insets.top}
          onSearch={null}
          onHome={null}
        />
        <View style={[pbk.col, pbk.state]}>{children}</View>
      </View>
    </View>
  );

  if (loading)
    return stateFrame(
      <>
        <ActivityIndicator color={color.green} />
        <Text style={pbk.note}>{es ? 'Abriendo el playbook…' : 'Opening the playbook…'}</Text>
      </>
    );

  if (error || !content)
    return stateFrame(
      <>
        <Text style={pbk.note}>
          {es
            ? 'No pudimos abrir el playbook. Revisa tu conexión e inténtalo de nuevo.'
            : "We couldn't open the playbook. Check your connection and try again."}
        </Text>
        <Btn variant="ghost" label={es ? 'Reintentar' : 'Try again'} onPress={reload} />
      </>
    );

  const { book } = content;
  /**
   * QUIZ-SCORE-DENOM. The authoritative run length is the BOOK's own
   * `settings.quiz.rules.perRun`, and it is authoritative because the server
   * enforces it: `playbook_start_quiz` deals exactly that many questions and
   * RAISES if the bank cannot fill a run (schema :1306, :1336-1338), so every
   * score ever written was out of this number. Nothing is stored alongside a
   * result — `playbook_quiz_results` has `best_score` and no total — so a book
   * that states no `perRun` gets null here and the staff screens print the
   * bare score rather than a guessed denominator.
   */
  const perRun = book.settings?.quiz?.rules?.perRun;
  const quizTotal = typeof perRun === 'number' && perRun > 0 ? perRun : null;
  const title = pick(book.meta?.title, lang) || 'PAC Playbook';
  const author = book.meta?.author || book.author_name;
  const got = playerId ? progress.got : null;

  /* ------------------------------------------------------------- the header */

  let back: HeaderBack | null = null;
  let sub = pick(book.meta?.subtitle, lang);
  let doodle: DoodleScreen = 'other';
  // What the chalk doodle for this page is keyed off: the page's own identity,
  // never its position in the book. Insert a card and every other page keeps
  // the mark it had.
  let pageKey = 'quiz';

  if (nav.screen === 'cover') {
    doodle = 'cover';
    pageKey = 'cover';
  } else if (nav.screen === 'home') {
    doodle = 'home';
    pageKey = 'home';
    back = { label: es ? 'Portada' : 'Cover', go: () => go({ screen: 'cover' }) };
  } else if (nav.screen === 'chapter') {
    doodle = 'chapter';
    pageKey = `ch:${nav.ch}`;
    sub = pick(chaptersByKey.get(nav.ch)?.content?.name, lang);
    back = { label: t('contents'), go: () => go({ screen: 'home' }) };
  } else if (nav.screen === 'card') {
    doodle = 'card';
    pageKey = `card:${nav.id}`;
    const c = cardsByKey.get(nav.id);
    sub = pick(chaptersByKey.get(c?.chapter_key || '')?.content?.name, lang);
    if (trail.length) {
      const prev = cardsByKey.get(trail[trail.length - 1]);
      back = { label: pick(prev?.content?.name, lang), go: trailBack };
    } else if (fromSearch) {
      back = { label: es ? 'Búsqueda' : 'Search', go: () => go({ screen: 'home' }, false, true) };
    } else {
      back = {
        label: pick(chaptersByKey.get(c?.chapter_key || '')?.content?.name, lang),
        go: () => go({ screen: 'chapter', ch: c?.chapter_key || '' }),
      };
    }
  } else if (nav.screen === 'chend') {
    doodle = 'chend';
    pageKey = `end:${nav.ch}`;
    sub = es ? 'Preguntas y notas' : 'Questions & notes';
    back = {
      label: pick(chaptersByKey.get(nav.ch)?.content?.name, lang),
      go: () => go({ screen: 'chapter', ch: nav.ch }),
    };
  } else if (nav.screen === 'progress') {
    pageKey = 'progress';
    sub = es ? 'Progreso del equipo' : 'Team progress';
    back = { label: t('contents'), go: () => go({ screen: 'home' }) };
  } else if (nav.screen === 'player') {
    pageKey = `player:${nav.id}`;
    sub = es ? 'Jugador/a' : 'Player';
    back = {
      label: es ? 'Progreso' : 'Progress',
      go: () => go({ screen: 'progress' }),
    };
  } else if (nav.screen === 'messages') {
    pageKey = 'messages';
    sub = es ? 'Tus mensajes' : 'Your messages';
    /* Back is the COVER, because that is the only door into this screen. */
    back = { label: es ? 'Portada' : 'Cover', go: () => go({ screen: 'cover' }) };
  } else if (nav.screen === 'inbox') {
    pageKey = 'inbox';
    sub = es ? 'Preguntas' : 'Questions';
    back = { label: t('contents'), go: () => go({ screen: 'home' }) };
  } else if (nav.screen === 'thread') {
    pageKey = `thread:${nav.q.question_id}`;
    sub = es ? 'Mensaje' : 'Message';
    back = { label: es ? 'Preguntas' : 'Questions', go: () => go({ screen: 'inbox' }) };
  } else {
    sub = t('quiz');
    back = {
      label: t('contents'),
      go: () => {
        quiz.reset();
        go({ screen: 'home' });
      },
    };
  }

  const showSearch = ['chapter', 'card', 'chend'].includes(nav.screen);

  /* --------------------------------------------------------------- the body */

  let body: React.ReactNode = null;

  if (nav.screen === 'cover') {
    body = (
      <CoverScreen
        chapters={chapters}
        cards={cards}
        author={author}
        onOpen={() => go({ screen: 'home' })}
        /* STAFF-ROWS-ON-COVER / FAMILY-MESSAGES-ON-COVER. Both blocks are
           null-by-default on the cover itself; what decides whether they
           render is the server (a roster, a can-answer probe, a message the
           family actually sent), never a role string read here. */
        staff={
          staff.isStaff
            ? {
                isStaff: true,
                canAnswer: staff.canAnswer,
                openCount: staff.openCount,
                onProgress: () => go({ screen: 'progress' }),
                onInbox: () => go({ screen: 'inbox' }),
              }
            : null
        }
        mail={
          messages.messages.length
            ? {
                messages: messages.messages,
                newCount: messages.newCount,
                isNew: messages.isNew,
                /* Opening the list IS the look that clears the count; the
                   per-item dots stay put (see `useMyMessages`). */
                onAll: () => {
                  messages.markSeen();
                  go({ screen: 'messages' });
                },
              }
            : null
        }
      />
    );
  } else if (nav.screen === 'home') {
    const nx = nextUnread();
    body = (
      <ContentsScreen
        chapters={chapters}
        cards={cards}
        blocks={blocks}
        got={got}
        quizResult={progress.quizResult}
        rev={book.meta?.rev || ''}
        query={query}
        setQuery={setQuery}
        autoFocusSearch={focusSearch}
        continueLabel={pick(nx?.content?.name, lang)}
        onOpenChapter={(ch) => go({ screen: 'chapter', ch })}
        onOpenCard={(key, search) => {
          setFromSearch(!!search);
          go({ screen: 'card', id: key }, false, true);
        }}
        onOpenCover={() => go({ screen: 'cover' })}
        onOpenQuiz={() => go({ screen: 'quiz' })}
        onContinue={() => nx && openCard(nx.key)}
      />
    );
  } else if (nav.screen === 'chapter') {
    const chapter = chaptersByKey.get(nav.ch);
    const list = cardsOf(nav.ch);
    if (chapter) {
      const nx = got ? list.find((x) => !got.has(x.id)) || list[0] : list[0];
      body = (
        <ChapterScreen
          chapter={chapter}
          cards={list}
          got={got}
          continueLabel={pick(nx?.content?.name, lang)}
          onOpenCard={openCard}
          onOpenEnd={() => openEnd(nav.ch)}
          onContinue={() => nx && openCard(nx.key)}
        />
      );
    }
  } else if (nav.screen === 'card') {
    const c = cardsByKey.get(nav.id);
    const chapter = c ? chaptersByKey.get(c.chapter_key) : null;
    if (c && chapter) {
      body = (
        <CardScreen
          card={c}
          chapter={chapter}
          chapterCards={cardsOf(c.chapter_key)}
          cardsByKey={cardsByKey}
          chaptersByKey={chaptersByKey}
          blocks={blocks}
          blocksReady={blocksReady}
          look={offline?.look}
          reminder={pick(book.meta?.reminder, lang)}
          author={author}
          got={got}
          onGotIt={onGotIt}
          gotError={gotError}
          onOpenCard={openCard}
          onFollowLink={followLink}
          onOpenEnd={() => openEnd(c.chapter_key)}
          trailBack={
            trail.length
              ? {
                  label: pick(cardsByKey.get(trail[trail.length - 1])?.content?.name, lang),
                  go: trailBack,
                }
              : null
          }
          extraCta={
            quizReturn
              ? {
                  label: es ? 'Volver al quiz' : 'Back to quiz',
                  go: () => {
                    setQuizReturn(false);
                    go({ screen: 'quiz' });
                  },
                }
              : null
          }
        />
      );
    }
  } else if (nav.screen === 'chend') {
    const chapter = chaptersByKey.get(nav.ch);
    const i = chapters.findIndex((c) => c.key === nav.ch);
    const nextCh = chapters[i + 1] || null;
    if (chapter && playerId) {
      body = (
        <ChapterEndScreen
          chapter={chapter}
          cards={cardsOf(nav.ch)}
          playerId={playerId}
          got={progress.got}
          nextChapterName={nextCh ? pick(nextCh.content?.name, lang) : null}
          offline={offline?.questions}
          onNextChapter={() => {
            const first = nextCh ? cardsOf(nextCh.key)[0] : null;
            if (first) openCard(first.key);
            else go({ screen: 'home' });
          }}
        />
      );
    }
  } else if (nav.screen === 'messages') {
    body = (
      <MessagesScreen
        messages={messages.messages}
        chapters={chapters}
        cards={cards}
        isNew={messages.isNew}
        loading={messages.loading}
        /* The chapter's own Questions & notes screen — `openEnd` already
           sends a staff viewer to the chapter list instead (R-1), and only a
           reader WITH a player has messages at all. */
        onOpenChapter={openEnd}
      />
    );
  } else if (nav.screen === 'progress') {
    body = (
      <TeamProgressScreen
        roster={staff.roster}
        loading={staff.loading}
        quizTotal={quizTotal}
        onOpenPlayer={(id) => go({ screen: 'player', id })}
      />
    );
  } else if (nav.screen === 'player') {
    const p = staff.roster.find((r) => r.player_id === nav.id);
    if (p) {
      body = (
        <PlayerProgressScreen
          player={p}
          chapters={chapters}
          cards={cards}
          quizTotal={quizTotal}
          offlineGot={offline?.staff ? Array.from(progress.got) : null}
        />
      );
    }
  } else if (nav.screen === 'inbox') {
    body = (
      <InboxScreen
        offline={offline?.staff ? offline.staff.inbox : null}
        onOpenThread={(q) => go({ screen: 'thread', q })}
      />
    );
  } else if (nav.screen === 'thread') {
    body = (
      <ThreadScreen
        question={nav.q}
        offlineReplies={
          offline?.staff ? (offline.staff.replies?.[nav.q.question_id] ?? []) : null
        }
        onAnswered={staff.reload}
      />
    );
  } else {
    body = (
      <QuizScreen
        run={quiz}
        blocks={blocks}
        cardsByKey={cardsByKey}
        bestResult={progress.quizResult}
        onReadCard={(key) => {
          setQuizReturn(true);
          go({ screen: 'card', id: key });
        }}
        onHome={() => {
          quiz.reset();
          progress.refreshQuizResult();
          go({ screen: 'home' });
        }}
      />
    );
  }

  /* --------------------------------------------- the parent's note (R-4) */

  const parentNote =
    progress.viewer === 'parent' && (nav.screen === 'card' || nav.screen === 'chapter');

  /* The chalk sketches for this page. `doodlePlan` is pure and keyed off
   * `pageKey`, so the same page always carries the same marks.
   *
   * THE COVER DRAWS NO BAND — Lu's phone look, 2026-10-30. `ZONES.cover` is
   * `{ top: 2 }`, and for the seed `cover:cover` the pool hands it `press`
   * (the goal mouth) and `corner` (the corner arc and its flag) — the "box"
   * and the "flag/corner" in Lu's note. Stacked over `CoverArt` they made one
   * sketch block tall enough to push the title off the first screen. The plan
   * is MIRRORED (`doodleArt.ts`, byte-identical to web `c772111`), so it is
   * not edited: the cover simply does not draw what it is handed, and the
   * cover's own art — now half height — is the one sketch it carries. Every
   * other screen is untouched. */
  const plan = doodlePlan(doodle, pageKey);
  const sketches = doodle === 'cover' ? { ...plan, top: [] } : plan;
  const strength = Number(STRENGTH[strengthPreset(offline?.dz ?? '')]);

  return (
    <View style={pbk.page}>
      <View style={pbk.col}>
        <PlaybookHeader
          title={title}
          sub={sub}
          back={back}
          /* Only where there is no in-book back — the cover. */
          onExit={!back ? onExit : null}
          crestUrl={crest?.logo_url}
          crestAlt={crest?.name}
          topInset={insets.top}
          onSearch={
            showSearch
              ? () => {
                  setFocusSearch(true);
                  go({ screen: 'home' }, false, true);
                }
              : null
          }
          onHome={
            back && nav.screen !== 'home'
              ? () => {
                  quiz.reset();
                  setQuery('');
                  go({ screen: 'home' });
                }
              : null
          }
        />
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={[pbk.scr, { paddingBottom: insets.bottom + 12 }]}
          keyboardShouldPersistTaps="handled"
        >
          <DoodleBand place="top" marks={sketches.top} strength={strength} />

          {parentNote ? (
            <View style={pbk.remind}>
              <Text style={pbk.remindText}>
                {es
                  ? 'Lo estás viendo como familia. Háganlo juntos: tu toque de «Entendido» cuenta para tu hijo o hija.'
                  : 'You are reading this as a parent. Do it together — your “Got it” counts for your child.'}
              </Text>
            </View>
          ) : null}

          {!playerId && nav.screen === 'home' ? (
            <Text style={pbk.note}>
              {es
                ? 'Vista de solo lectura: el libro completo, sin progreso de ningún jugador.'
                : 'Read-only view: the whole book, with nobody’s progress.'}
            </Text>
          ) : null}

          {body}

          <DoodleBand place="foot" marks={sketches.foot} strength={strength} />
        </ScrollView>
      </View>
    </View>
  );
}
