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
 *        `render(d, null, …)`, static by ruling E-R2 = A, plus the geometric
 *        hit test the quiz uses. Not touched by M3.
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
 *  2. **Every beat cell is lit.** The web lights a cell when `tt >= beat.at`,
 *     and the finished picture is `tt = total`, past every beat — so the
 *     reduced-motion hold branch lights them all too. That is what a finished
 *     picture honestly looks like. Whether the row should instead read plain
 *     on a static board is a WEB-FIRST question, recorded as
 *     PLAYBOOK-STATIC-BEATS-ALL-ON.
 *
 * A frames card keeps its caption: the last frame's `cap`, which is the frame
 * the board draws and the frame `tapTarget()` reads.
 */

import React from 'react';
import { Text, View } from 'react-native';
import { DiagramBoard } from './DiagramBoard';
import type { DiagramBlock } from './diagram/types';
import { Legend } from './ui';
import { Fmt } from './Fmt';
import { pick, useLang, type Lang } from './strings';
import { pbk } from './styles';
import { color } from './theme';

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

export function CardBoard({ block, cardKey }: { block: DiagramBlock; cardKey: string }) {
  const { lang, t } = useLang();
  const es = lang === 'es';
  const frames = block.frames;
  const beats = frames ? [] : block.beats || [];
  const band = sideBand(cardKey, lang);
  const cap = frames ? pick(frames[frames.length - 1].cap, lang) : '';

  const board = <DiagramBoard block={block} lang={lang} />;

  return (
    <>
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
          {beats.map((b, i) => (
            // All on: the static picture is past every beat. See the header.
            <View key={i} style={[pbk.beatCell, pbk.beatCellOn]}>
              <Text style={[pbk.beatText, pbk.beatTextOn]}>{pick(b.label, lang)}</Text>
            </View>
          ))}
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
