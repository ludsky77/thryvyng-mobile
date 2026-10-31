/**
 * A card — the prototype's readingNav() + cardHTML(), :590-598 and :679-711.
 *
 * The body is a fixed order of optional blocks (cue, read, see, the board, do,
 * more, roles, if not, ritual, pointers, use, see-also, the reminder and the
 * byline), then the footer: previous · Got it · next. That ORDER is the design;
 * every block below is in the web's position, and `readingNav()` is the web's
 * function unchanged — it is arithmetic over the chapter's card list and there
 * is nothing in it for a platform to disagree about.
 *
 * WHICH BOARD appears depends on the card's `kind`, and the five-way branch is
 * the web's: positions → `PositionsPanel`, formation → `FormationPanel`,
 * numbers → `NumbersPanel`, movement → `MovementPanel`, otherwise the card's
 * own diagram through `CardBoard`. A card with no diagram at all falls through
 * to the prototype's own dashed "Diagram pending" panel, and the two cards the
 * web exempts from it (`mind` chapter, `FM5v5`) are exempt here too.
 *
 * "GOT IT" IS THE ONE WRITE ON THIS SCREEN, AND M3 DOES NOT SEND IT. The
 * button, its two faces, its busy state and the error line below it are all
 * built; `usePlaybookProgress.markGotIt` ticks locally and carries the
 * `TODO(M-later)` for the RPC. Ruling R-5's behaviour — the tick rolls back
 * and the sentence is shown when the server refuses — is written out in that
 * hook, ready for the call.
 */

import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { CardBoard } from '../CardBoard';
import type { Card, ChapterRow, PlaybookBlocks } from '../types';
import { other, pick, useLang, type Lang } from '../strings';
import { Fmt } from '../Fmt';
import { PositionsPanel } from '../panels/PositionsPanel';
import { MovementPanel } from '../panels/MovementPanel';
import { FormationPanel, NumbersPanel } from '../panels/FormationPanels';
import { Btn, Chip, Cta } from '../ui';
import { pbk } from '../styles';

interface ReadingNav {
  prev: Card | null;
  next: Card | null;
  /** 'same' | 'section' | 'chend' */
  nextKind: 'same' | 'section' | 'chend';
  nextSectionName: string;
  indexInChapter: number;
  chapterCards: Card[];
  subList: Card[];
  subPos: number;
}

/** :590-598 — reading order is every card of the chapter, sub-topics named. */
function readingNav(
  card: Card,
  chapter: ChapterRow,
  chapterCards: Card[],
  lang: Lang
): ReadingNav {
  const i = chapterCards.findIndex((x) => x.key === card.key);
  const subList = card.content?.sub
    ? chapterCards.filter((x) => x.content?.sub === card.content.sub)
    : chapterCards;
  const subPos = subList.findIndex((x) => x.key === card.key);
  const prev = i > 0 ? chapterCards[i - 1] : null;
  const next = i < chapterCards.length - 1 ? chapterCards[i + 1] : null;

  let nextKind: ReadingNav['nextKind'] = 'same';
  let nextSectionName = '';
  if (next && next.content?.sub !== card.content?.sub) {
    const s = chapter.content?.subs?.find((x) => x.id === next.content?.sub);
    nextKind = 'section';
    nextSectionName = pick(s?.name, lang);
  }
  if (!next) nextKind = 'chend';

  return { prev, next, nextKind, nextSectionName, indexInChapter: i, chapterCards, subList, subPos };
}

interface CardScreenProps {
  card: Card;
  chapter: ChapterRow;
  chapterCards: Card[];
  cardsByKey: Map<string, Card>;
  chaptersByKey: Map<string, ChapterRow>;
  blocks: PlaybookBlocks;
  blocksReady: boolean;
  reminder: string;
  author: string;
  /** null = staff read-only view: no Got it, no progress (R-1). */
  got: Set<string> | null;
  onGotIt: (card: Card, value: boolean) => Promise<void>;
  gotError: string | null;
  onOpenCard: (cardKey: string) => void;
  onFollowLink: (cardKey: string) => void;
  onOpenEnd: () => void;
  trailBack: { label: string; go: () => void } | null;
  extraCta?: { label: string; go: () => void } | null;
}

/** `.blk` — one labelled text block. */
function Blk({
  label,
  labelStyle,
  text,
}: {
  label: string;
  labelStyle?: object;
  text: string;
}) {
  return (
    <View style={pbk.blk}>
      <Text style={[pbk.blockLabel, labelStyle]}>{label}</Text>
      <Text style={pbk.blkText}>
        <Fmt text={text} />
      </Text>
    </View>
  );
}

/** `.one` — a labelled paragraph with no box. */
function One({ label, text, mute }: { label?: string; text: string; mute?: boolean }) {
  return (
    <View>
      {label ? <Text style={pbk.blockLabel}>{label}</Text> : null}
      <Text style={mute ? pbk.oneMute : pbk.one}>
        <Fmt text={text} />
      </Text>
    </View>
  );
}

/** `.verbs` / `.reasons` — the two F0 grids, :684-685. */
function PairGrid({ rows, reasons }: { rows: [string, string][]; reasons?: boolean }) {
  return (
    <View style={pbk.gridRow}>
      {rows.map(([a, b]) => (
        <View key={a} style={reasons ? pbk.reasonCell : pbk.verbCell}>
          <Text style={reasons ? pbk.reasonName : pbk.verbName}>{a}</Text>
          <Text style={pbk.verbAlt}>{b}</Text>
        </View>
      ))}
    </View>
  );
}

export function CardScreen(props: CardScreenProps) {
  const {
    card,
    chapter,
    chapterCards,
    cardsByKey,
    chaptersByKey,
    blocks,
    blocksReady,
    reminder,
    author,
    got,
    onGotIt,
    gotError,
    onOpenCard,
    onFollowLink,
    onOpenEnd,
    trailBack,
    extraCta,
  } = props;
  const { lang, t } = useLang();
  const es = lang === 'es';
  const c = card.content || {};
  const nav = readingNav(card, chapter, chapterCards, lang);
  const sub = c.sub ? chapter.content?.subs?.find((s) => s.id === c.sub) : null;
  const [busy, setBusy] = useState(false);

  useEffect(() => setBusy(false), [card.key]);

  const kind = c.kind;
  const diagram = blocks.diagrams[card.diagram_key || card.key];
  const isGot = got ? got.has(card.id) : false;

  let board: React.ReactNode = null;
  if (kind === 'positions' && blocks.positions)
    board = <PositionsPanel block={blocks.positions} diagram={blocks.diagrams[card.key]} />;
  else if (kind === 'formation' && blocks.formations[card.key])
    board = (
      <FormationPanel block={blocks.formations[card.key]} diagram={blocks.diagrams[card.key]} />
    );
  else if (kind === 'numbers' && blocks.numbers)
    board = <NumbersPanel block={blocks.numbers} diagram={blocks.diagrams[card.key]} />;
  else if (kind === 'movement' && blocks.movement) board = <MovementPanel block={blocks.movement} />;
  else if (diagram) board = <CardBoard block={diagram} cardKey={card.key} />;
  else if (!blocksReady)
    board = (
      <View style={pbk.frame}>
        <View style={{ minHeight: 120, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={pbk.boardStText}>{es ? 'cargando…' : 'loading…'}</Text>
        </View>
        <View style={pbk.tray}>
          <View style={pbk.trayChalk} />
        </View>
      </View>
    );
  else if (card.chapter_key !== 'mind' && card.key !== 'FM5v5')
    board = (
      <View style={pbk.pend}>
        <Text style={[pbk.blockLabel, { letterSpacing: 1.2 }]}>{t('pend')}</Text>
        <Text style={pbk.pendText}>
          <Fmt text={pick(c.see, lang)} />
        </Text>
      </View>
    );

  const links = (c.links || []).filter((x) => cardsByKey.has(x) && x !== card.key);
  const pointers = c.pointers?.[lang] || c.pointers?.en || [];

  return (
    <>
      <View style={pbk.crumb}>
        <Text style={pbk.crumbText}>{pick(chapter.content?.name, lang)}</Text>
        {sub ? (
          <>
            <Text style={pbk.crumbText}>·</Text>
            <Text style={[pbk.crumbText, pbk.crumbStrong]}>{pick(sub.name, lang)}</Text>
          </>
        ) : null}
        <Text style={pbk.crumbText}>·</Text>
        <Text style={pbk.crumbText}>
          {t('card')} {nav.subPos + 1} {t('of')} {nav.subList.length}
        </Text>
        <View style={pbk.crumbTag}>
          <Text style={pbk.crumbTagText}>{card.key}</Text>
        </View>
      </View>

      <View style={pbk.pips}>
        {nav.subList.map((x, i) => (
          <View
            key={x.key}
            style={[pbk.pip, i < nav.subPos && pbk.pipDone, i === nav.subPos && pbk.pipCur]}
          />
        ))}
      </View>

      {trailBack ? (
        <Pressable onPress={trailBack.go} style={pbk.trailbar} accessibilityRole="button">
          <Text style={pbk.trailbarText}>
            ‹ {es ? 'Volver a' : 'Back to'}{' '}
            <Text style={{ color: '#fff' }}>{trailBack.label}</Text>
          </Text>
        </Pressable>
      ) : null}

      <View style={pbk.titleblk}>
        <View style={pbk.titleTape} />
        <Text style={pbk.title}>{pick(c.name, lang)}</Text>
        <View style={pbk.titleRule} />
        <Text style={pbk.titleEs}>{other(c.name, lang)}</Text>
      </View>

      {pick(c.cue, lang) ? (
        <View style={pbk.cuechip}>
          <Text style={pbk.cuechipSmall}>
            {t(card.chapter_key === 'gears' ? 'call' : 'cue')}
          </Text>
          <Text style={pbk.cuechipText}>“{pick(c.cue, lang)}”</Text>
          {c.line ? (
            <Text style={pbk.cuechipSmall}>
              · {t('line')} {c.line.toUpperCase()}
            </Text>
          ) : null}
        </View>
      ) : null}

      {pick(c.read, lang) ? (
        <Blk label={t('read_')} labelStyle={pbk.blkLabelRead} text={pick(c.read, lang)} />
      ) : null}

      <One label={t('see')} text={pick(c.see, lang)} />

      {card.key === 'F0' ? (
        <PairGrid
          rows={[
            [es ? 'Defender' : 'Defend', es ? 'Defend' : 'Defender'],
            [es ? 'Recuperar' : 'Regain', es ? 'Regain' : 'Recuperar'],
            [es ? 'Gestar' : 'Create', es ? 'Create' : 'Gestar'],
            [es ? 'Definir' : 'Finish', es ? 'Finish' : 'Definir'],
          ]}
        />
      ) : null}

      {board}

      {card.key === 'F0' ? (
        <PairGrid
          reasons
          rows={[
            [es ? 'Espacio' : 'Space', es ? 'Space' : 'Espacio'],
            [es ? 'Tiempo' : 'Time', es ? 'Time' : 'Tiempo'],
            [es ? 'Engaño' : 'Deception', es ? 'Deception' : 'Engaño'],
          ]}
        />
      ) : null}

      <One label={t('do')} text={pick(c.do, lang)} />

      {pick(c.more, lang) ? <One label={t('more')} text={pick(c.more, lang)} mute /> : null}

      {pick(c.roles, lang) ? <Blk label={t('roles')} text={pick(c.roles, lang)} /> : null}

      {pick(c.ifnot, lang) ? (
        <Blk label={t('ifnot')} labelStyle={pbk.blkLabelIfnot} text={pick(c.ifnot, lang)} />
      ) : null}

      {pick(c.ritual, lang) ? (
        <Blk label={t('ritual')} labelStyle={pbk.blkLabelRit} text={pick(c.ritual, lang)} />
      ) : null}

      {pointers.length > 0 ? (
        <View style={pbk.blk}>
          <Text style={pbk.blockLabel}>{es ? 'Claves' : 'Pointers'}</Text>
          <View style={pbk.ptrs}>
            {pointers.map((x, i) => (
              <View key={i} style={pbk.ptrRow}>
                <Text style={pbk.blkText}>•</Text>
                <Text style={[pbk.blkText, { flex: 1 }]}>
                  <Fmt text={x} />
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {pick(c.use, lang) ? <Blk label={t('use')} text={pick(c.use, lang)} /> : null}

      {links.length > 0 || pick(c.link, lang) ? (
        <View style={pbk.linkbox}>
          <Text style={pbk.blockLabel}>{t('link')}</Text>
          {pick(c.link, lang) ? (
            <Text style={pbk.linkboxText}>
              <Fmt text={pick(c.link, lang)} />
            </Text>
          ) : null}
          {links.length > 0 ? (
            <View style={pbk.linkchips}>
              {links.map((x) => {
                const lc = cardsByKey.get(x);
                if (!lc) return null;
                return (
                  <Pressable
                    key={x}
                    style={pbk.linkchip}
                    onPress={() => onFollowLink(x)}
                    accessibilityRole="button"
                  >
                    <Text style={pbk.linkchipEyebrow}>
                      {pick(chaptersByKey.get(lc.chapter_key)?.content?.name, lang)}
                    </Text>
                    <Text style={pbk.linkchipText}>{pick(lc.content?.name, lang)} ›</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={pbk.remind}>
        <Text style={pbk.remindText}>{reminder}</Text>
      </View>

      <View style={pbk.auth}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={pbk.authMag} />
          <Text style={pbk.authText}>{author}</Text>
        </View>
        <Text style={pbk.authText}>
          {t('card')} {nav.indexInChapter + 1} / {nav.chapterCards.length}
        </Text>
      </View>

      {gotError ? <Text style={pbk.qstatus}>{gotError}</Text> : null}

      <Cta>
        {extraCta ? (
          <Btn variant="violet" label={extraCta.label} onPress={extraCta.go} />
        ) : null}
        <View style={pbk.cardbar}>
          <Btn
            variant="ghost"
            label="‹"
            disabled={!nav.prev}
            onPress={() => nav.prev && onOpenCard(nav.prev.key)}
            style={pbk.cardbarIcon}
          />

          {got ? (
            <Btn
              variant={isGot ? 'done' : 'primary'}
              label={isGot ? t('gotd') : t('got')}
              disabled={busy}
              onPress={() => {
                setBusy(true);
                void onGotIt(card, !isGot).finally(() => setBusy(false));
              }}
              style={pbk.cardbarMid}
            />
          ) : (
            <Chip style={[pbk.cardbarMid, { justifyContent: 'center' }]}>
              {es ? 'Solo lectura' : 'Read only'}
            </Chip>
          )}

          <Btn
            variant={nav.nextKind === 'same' ? 'ghost' : 'violet'}
            label={
              nav.nextKind === 'same'
                ? t('next')
                : nav.nextKind === 'section'
                  ? es
                    ? 'Sección ›'
                    : 'Section ›'
                  : es
                    ? 'Fin ›'
                    : 'Finish ›'
            }
            small={
              nav.nextKind === 'same'
                ? null
                : nav.nextKind === 'section'
                  ? nav.nextSectionName
                  : es
                    ? 'preguntas y notas'
                    : 'questions & notes'
            }
            stack={nav.nextKind !== 'same'}
            onPress={() =>
              nav.nextKind === 'chend' ? onOpenEnd() : nav.next && onOpenCard(nav.next.key)
            }
            style={pbk.cardbarNext}
          />
        </View>
      </Cta>
    </>
  );
}
