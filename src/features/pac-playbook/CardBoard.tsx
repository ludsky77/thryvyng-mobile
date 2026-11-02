/**
 * A card's figure: M2's board, with the chrome the web wraps round it.
 *
 * NAMES, because the two repos split this differently and the recon's file map
 * has to be readable:
 *
 *   web  `diagram/DiagramBoard.tsx` = the rAF loop + the frame, the tray, the
 *        side band, the beats row, the F4 I/S/C row, the cue line and the
 *        legend — board AND chrome, one component.
 *   mob  `DiagramBoard.tsx` (M2)    = the board only: one `<SvgXml>` over
 *        `render(d, tt, …)`, plus the geometric hit test the quiz uses.
 *   mob  `CardBoard.tsx` (this)     = that chrome, round that board.
 *
 * TWO THINGS THE STATIC BOARD CHANGES, both of them consequences of E-R2 = A
 * rather than decisions taken here:
 *
 *  1. **The `.st` pill is gone.** On the web it reads "loop" or "paused · tap",
 *     which is a statement about a running animation and a tap that pauses it.
 *     There is no loop and tapping a card board does nothing, so a pill saying
 *     either would be false. The two strings stay in `strings.tsx` (`loop`,
 *     `paused`) because the dictionary is the web's, verbatim.
 *  2. **Every beat cell is lit on a card with no tabs.** The web lights a cell
 *     when `tt >= beat.at`, and the finished picture is `tt = total`, past
 *     every beat — so the reduced-motion hold branch lights them all too. That
 *     is what a finished picture honestly looks like. Whether the row should
 *     instead read plain on a static board is a WEB-FIRST question, recorded as
 *     PLAYBOOK-STATIC-BEATS-ALL-ON.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * TABS — PLAYBOOK-DIAGRAM-TABS, Lu, 2026-11-02.
 *
 * THE BUG THIS FIXES. A block may carry `frames` instead of `elements`
 * (`diagram/types.ts:69-73`), and both this file and `DiagramBoard` drew the
 * LAST one and nothing else. Six of the book's 38 diagrams carry two frames —
 * F1, F4, PL1, P17, P11, GF7 — so **frame 1 of each of those six cards was in
 * the database, was fetched, and could not be looked at.** Two of them (P17,
 * P11, GF7) are explicitly an A/B pair whose whole teaching is the comparison:
 * "A · Space to goal → break" against "B · They are set → keep". The reader
 * only ever saw B.
 *
 * So a frames card now gets one tab per frame, and the tab row is the door to
 * the frames that were already there. **This is a visible change to those six
 * cards, not a new feature on new content.**
 *
 * WHAT A TAB CARRIES. A number, and nothing else. The frame's own `cap` is a
 * sentence — "Ring 1 on the ball · ring 2 around it · ring 3 shapes the rest"
 * — which at five tabs on a 343pt column leaves about eight characters per
 * tab, so the cap stays where it already was (the board's bottom-left pill,
 * `boardCap`) and changes with the tab. The cap is also the tab's
 * `accessibilityLabel`, so a screen reader hears the sentence a sighted reader
 * reads off the pill.
 *
 * 2 TO 5 FRAMES. One frame is not a sequence, so a `frames: [one]` block draws
 * as a plain board with no row — the tabs appear at two and the row is sized
 * for five (`styles.ts` `dtabs`). Nothing caps it at five: `frames` is content
 * and the row is `flex: 1` cells, so a sixth would narrow them rather than
 * break the layout.
 *
 * MOTION, AND HOW IT STAYS INSIDE RULING E-R2 = A. Each frame carries its own
 * `beats` (every one of the six cards above has two or three), and selecting a
 * tab plays THAT frame's beats: the board is re-rendered at each beat's own
 * `at`, on the diagram's own clock, and then once more at the finished
 * picture. **That is `beats.length + 1` renders per tab — three or four — not
 * sixty a second.** E-R2 = A exists because `SvgXml` re-parses its string on
 * every change and the web's rAF loop would mean a full XML parse per frame
 * (M2 measured that at 16.7 ms mean on a simulator); four parses spread over a
 * two-second sequence is not that loop, and it is the only way a beat row can
 * mean anything. A card with NO tabs is untouched: one parse, the finished
 * picture, every cell lit.
 *
 * REDUCED MOTION skips the playback entirely — the finished picture and every
 * cell lit, which is exactly what the card did before this change. It is read
 * once and listened to, so turning the setting on mid-read lands.
 *
 * THE ACTIVE TAB WEARS THE CARD'S SECTION TONE (ruling PLAYBOOK-SECTION-RAIL),
 * the same tone as the card's kicker, its breadcrumb and its row's pip. A card
 * in no section passes no tone and the active tab falls back to `chalk`, which
 * is what every other "on" state in the book uses.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, Text, View } from 'react-native';
import { DiagramBoard } from './DiagramBoard';
import { diagTotal } from './diagram/geometry';
import type { Diagram, DiagramBlock } from './diagram/types';
import { Legend } from './ui';
import { Fmt } from './Fmt';
import { pick, useLang, type Lang } from './strings';
import { pbk } from './styles';
import { color, type SectionTone } from './theme';

/** The F3 "thirds" and F4 "far side" bands, :506-507 — the web's, verbatim. */
function sideBand(
  cardKey: string,
  lang: Lang
): { bl: string; sub: string; color?: string }[] | null {
  const es = lang === 'es';
  if (cardKey === 'F3')
    return [
      { bl: es ? 'SU TERCIO' : 'THEIR THIRD', sub: es ? 'arriesga' : 'take risks', color: '#e0705f' },
      { bl: es ? 'TERCIO MEDIO' : 'MIDDLE THIRD', sub: es ? 'progresa' : 'progress' },
      {
        bl: es ? 'NUESTRO TERCIO' : 'OUR THIRD',
        sub: es ? 'construye' : 'calm build',
        color: color.green,
      },
    ];
  if (cardKey === 'F4')
    return [
      {
        bl: es ? 'LADO LEJANO' : 'FAR SIDE',
        sub: es ? 'sigues en la jugada' : 'still in the play',
        color: color.green,
      },
    ];
  return null;
}

/** The F4 intervention / support / collaboration row, `.iscrow`. */
function IscRow({ es }: { es: boolean }) {
  const rows: [string, string, string][] = [
    ['I', es ? 'Intervención' : 'Intervention', es ? 'en el balón' : 'on the ball'],
    ['S', es ? 'Apoyo' : 'Support', es ? 'cerca, ahora' : 'close, right now'],
    ['C', es ? 'Colaboración' : 'Collaboration', es ? 'lo que sigue' : 'what comes next'],
  ];
  return (
    <View style={pbk.iscrow}>
      {rows.map(([k, name, small]) => (
        <View key={k} style={pbk.iscCell}>
          <View style={pbk.iscKey}>
            <Text style={pbk.iscKeyText}>{k}</Text>
          </View>
          <Text style={pbk.iscName}>{name}</Text>
          <Text style={pbk.iscSmall}>{small}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * The OS setting, read once and listened to. `false` on a refusal — a board
 * that animates when it should not is a smaller wrong than a board that never
 * animates because one promise rejected.
 */
function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let dead = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((v) => {
        if (!dead) setReduce(!!v);
      });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) =>
      setReduce(!!v)
    );
    return () => {
      dead = true;
      sub.remove();
    };
  }, []);
  return reduce;
}

/**
 * The selected frame's own clock — `null` is the finished picture, which is
 * both the start state and the end state.
 *
 * ONE TIMER PER BEAT, on the diagram's own `at` values, so the row lights in
 * the rhythm the content author wrote rather than in one this file invents.
 * `restartKey` changing is what restarts it: a tab press, and nothing else.
 */
function useBeatClock(d: Diagram, restartKey: string, enabled: boolean): number | null {
  const [tt, setTt] = useState<number | null>(null);
  useEffect(() => {
    setTt(null);
    if (!enabled) return;
    const ats = (d.beats || [])
      .map((b) => Math.max(0, b.at || 0))
      .sort((a, b) => a - b);
    if (!ats.length) return;
    const first = ats[0];
    const last = ats[ats.length - 1];
    // The frame's own end, never shorter than its last beat plus a breath.
    const end = Math.max(diagTotal(d), last + 600);
    const timers: ReturnType<typeof setTimeout>[] = [];
    setTt(first);
    for (let i = 1; i < ats.length; i++) {
      const at = ats[i];
      timers.push(setTimeout(() => setTt(at), at - first));
    }
    timers.push(setTimeout(() => setTt(null), end - first));
    return () => timers.forEach(clearTimeout);
  }, [d, restartKey, enabled]);
  return tt;
}

export function CardBoard({
  block,
  cardKey,
  tone,
  initialFrame,
}: {
  block: DiagramBlock;
  cardKey: string;
  /** The card's section tone, for the active tab. Null outside a section. */
  tone?: SectionTone | null;
  /**
   * Which tab to OPEN on, 0-based. Harness-only (`PlaybookLook.tab`) and
   * clamped: a simulator cannot be tapped from a shell, so without it the 4th
   * tab of a five-frame figure could not be photographed. The reader always
   * opens on tab 1.
   */
  initialFrame?: number;
}) {
  const { lang, t } = useLang();
  const es = lang === 'es';

  // One frame is not a sequence: a single-frame block draws as a plain board.
  const frames = block.frames && block.frames.length > 1 ? block.frames : null;
  const first = Math.max(0, Math.trunc(initialFrame ?? 0));
  const [sel, setSel] = useState(first);

  // Tab 1 on open, and on every change of card — `sel` is an index into THIS
  // block's frames and must never survive the block it indexes.
  useEffect(() => setSel(first), [block, cardKey, first]);
  const at = frames ? Math.min(sel, frames.length - 1) : 0;

  const reduce = useReduceMotion();
  const shown: Diagram = frames ? frames[at].d : block;
  const tt = useBeatClock(shown, `${cardKey}:${at}`, !!frames && !reduce);

  const beats = shown.beats || [];
  const band = sideBand(cardKey, lang);
  const cap = frames ? pick(frames[at].cap, lang) : '';
  const lit = useCallback(
    (beatAt: number | undefined) => tt == null || tt >= (beatAt || 0),
    [tt]
  );

  const board = <DiagramBoard block={block} lang={lang} frame={at} tt={tt} />;

  return (
    <>
      {frames ? (
        <View>
          <Text style={pbk.blockLabel}>{es ? 'Pasos' : 'Steps'}</Text>
          <View style={pbk.dtabs}>
            {frames.map((f, i) => {
              const on = i === at;
              return (
                <Pressable
                  key={i}
                  onPress={() => setSel(i)}
                  style={({ pressed }) => [
                    pbk.dtab,
                    on && pbk.dtabOn,
                    on && tone ? { backgroundColor: tone.tint, borderColor: tone.ink } : null,
                    pressed && !on && pbk.pressed,
                  ]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${es ? 'Paso' : 'Step'} ${i + 1}${
                    pick(f.cap, lang) ? ` · ${pick(f.cap, lang)}` : ''
                  }`}
                >
                  <Text
                    style={[
                      pbk.dtabText,
                      on && pbk.dtabOnText,
                      on && tone ? { color: tone.ink } : null,
                    ]}
                  >
                    {i + 1}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      <View style={pbk.frame}>
        {band ? (
          <View style={pbk.dside}>
            <View style={pbk.dband}>
              {band.map((b) => (
                <Text key={b.bl} style={[pbk.dbandLabel, b.color ? { color: b.color } : null]}>
                  {b.bl}
                  {'\n'}
                  <Text style={pbk.dbandSub}>{b.sub}</Text>
                </Text>
              ))}
            </View>
            <View style={{ flex: 1 }}>{board}</View>
          </View>
        ) : (
          board
        )}
        {cap ? (
          <View style={pbk.boardCap} pointerEvents="none">
            <Text style={pbk.boardCapText}>{cap}</Text>
          </View>
        ) : null}
        <View style={pbk.tray}>
          <View style={pbk.trayChalk} />
        </View>
      </View>

      {beats.length > 0 ? (
        <View style={pbk.beats}>
          {beats.map((b, i) => {
            // A tabbed card's cells light on its own clock; a card with no
            // tabs has no clock and every cell is lit. See the header.
            const on = lit(b.at);
            return (
              <View key={i} style={[pbk.beatCell, on && pbk.beatCellOn]}>
                <Text style={[pbk.beatText, on && pbk.beatTextOn]}>{pick(b.label, lang)}</Text>
              </View>
            );
          })}
        </View>
      ) : null}

      {cardKey === 'F4' ? <IscRow es={es} /> : null}

      {block.cue ? (
        <View style={pbk.cueline}>
          <View style={pbk.cuelineDot} />
          <View style={{ flex: 1 }}>
            <Text style={pbk.blockLabel}>{t('cuehdr')}</Text>
            <Text style={pbk.cuelineText}>
              <Fmt text={pick(block.cue, lang)} />
            </Text>
          </View>
        </View>
      ) : null}

      <Legend t={t} />
    </>
  );
}
