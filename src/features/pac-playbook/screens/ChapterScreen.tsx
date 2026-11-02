/**
 * A chapter's card list — the prototype's chapterHTML(), :577-589.
 *
 * Cards with no sub-topic come first as a plain list; the chapter's `subs`
 * then group the rest, each with its own count and description. Four of the
 * seven chapters have no subs at all and fall through to the single list.
 *
 * The status pip on the right (✓ / dashed "next" ring) and the "Questions &
 * notes" row are the player's; a staff viewer sees neither (R-1).
 */

import React from 'react';
import { Text, View } from 'react-native';
import type { Card, ChapterRow } from '../types';
import { other, pick, useLang } from '../strings';
import {
  Btn,
  Chev,
  Cta,
  IndexList,
  LearnBox,
  Row,
  RowEnd,
  SectTitle,
  Stamp,
  StatusPip,
  Tape,
  TopHead,
} from '../ui';
import { pbk } from '../styles';
import { toneFor } from '../type';

export function ChapterScreen({
  chapter,
  cards,
  got,
  onOpenCard,
  onOpenEnd,
  onContinue,
  continueLabel,
}: {
  chapter: ChapterRow;
  cards: Card[];
  /** null = staff read-only view. */
  got: Set<string> | null;
  onOpenCard: (cardKey: string) => void;
  onOpenEnd: () => void;
  onContinue: () => void;
  continueLabel: string;
}) {
  const { lang, t } = useLang();
  const es = lang === 'es';
  const subs = chapter.content?.subs || [];
  /**
   * section id → its POSITION in the chapter's own `subs`, which is what the
   * tone is keyed on (ruling PLAYBOOK-SECTION-RAIL). Built from `subs` and not
   * from the sections that end up rendered, so unpublishing a section's last
   * card cannot re-colour the sections after it.
   */
  const subPos = new Map(subs.map((x, i) => [x.id, i]));
  const next = got ? cards.find((x) => !got.has(x.id)) : undefined;
  const gotCount = got ? cards.filter((x) => got.has(x.id)).length : 0;

  const row = (x: Card) => {
    // A loose card belongs to no section, so it takes no tone and its pip
    // stays the book's green.
    const pos = x.content?.sub != null ? subPos.get(x.content.sub) : undefined;
    const tone = pos == null ? undefined : toneFor(pos);
    return (
    <Row
      key={x.key}
      onPress={() => onOpenCard(x.key)}
      /* One cue on every tappable row (PLAYBOOK-TYPE-PASS-E): the pip is the
         reader's status, the chevron is what says the row opens. A staff
         viewer has no pip and still gets the chevron. */
      right={
        <RowEnd>
          {got ? (
            <StatusPip
              state={got.has(x.id) ? 'ok' : next && next.key === x.key ? 'next' : 'none'}
              tone={tone}
            />
          ) : null}
        </RowEnd>
      }
    >
      <Text style={[pbk.rowName, pbk.rowNameSm]}>
        {pick(x.content?.name, lang)}
        <Text style={pbk.rowEm}>{'  ' + other(x.content?.name, lang)}</Text>
      </Text>
      <Text style={pbk.rowDesc}>{pick(x.content?.hook, lang)}</Text>
    </Row>
    );
  };

  const loose = cards.filter((x) => !x.content?.sub);

  return (
    <>
      <TopHead
        tape={
          <Tape xl>
            {String(chapter.n).padStart(2, '0')} · {pick(chapter.content?.name, lang)}
          </Tape>
        }
        stamp={got ? <Stamp lines={[`${gotCount} / ${cards.length}`, t('read')]} /> : undefined}
      />

      <LearnBox label={t('learn')} items={[pick(chapter.content?.learn, lang)]} />

      {subs.length > 0 ? (
        <>
          {loose.length > 0 ? <IndexList>{loose.map(row)}</IndexList> : null}
          {subs.map((s, i) => {
            const cs = cards.filter((x) => x.content?.sub === s.id);
            if (!cs.length) return null;
            return (
              <View key={s.id}>
                <SectTitle
                  position={i}
                  count={got ? `${cs.filter((x) => got.has(x.id)).length}/${cs.length}` : undefined}
                >
                  {pick(s.name, lang)}
                </SectTitle>
                <Text style={pbk.subdesc}>{pick(s.desc, lang)}</Text>
                <IndexList>{cs.map(row)}</IndexList>
              </View>
            );
          })}
        </>
      ) : (
        <IndexList>{cards.map(row)}</IndexList>
      )}

      {got ? (
        <Row right={<Chev />} onPress={onOpenEnd} style={pbk.qrow}>
          <Text style={[pbk.rowName, pbk.rowNameSm]}>
            {es ? 'Preguntas y notas' : 'Questions & notes'}
          </Text>
          <Text style={pbk.rowDesc}>
            {es
              ? '¿Algo no quedó claro? Escríbele a tu coach.'
              : 'Something unclear? Write to your coach.'}
          </Text>
        </Row>
      ) : null}

      <Cta>
        <Btn
          variant="primary"
          label={t('continue')}
          small={`· ${continueLabel}`}
          onPress={onContinue}
        />
      </Cta>
    </>
  );
}
