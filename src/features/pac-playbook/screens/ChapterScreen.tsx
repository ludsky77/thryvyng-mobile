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
import { Btn, Chev, Cta, IndexList, Row, SectTitle, Stamp, StatusPip, Tape, TopHead } from '../ui';
import { pbk } from '../styles';

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
  const next = got ? cards.find((x) => !got.has(x.id)) : undefined;
  const gotCount = got ? cards.filter((x) => got.has(x.id)).length : 0;

  const row = (x: Card) => (
    <Row
      key={x.key}
      onPress={() => onOpenCard(x.key)}
      right={
        got ? (
          <StatusPip
            state={got.has(x.id) ? 'ok' : next && next.key === x.key ? 'next' : 'none'}
          />
        ) : undefined
      }
    >
      <Text style={[pbk.rowName, pbk.rowNameSm]}>
        {pick(x.content?.name, lang)}
        <Text style={pbk.rowEm}>{'  ' + other(x.content?.name, lang)}</Text>
      </Text>
      <Text style={pbk.rowDesc}>{pick(x.content?.hook, lang)}</Text>
    </Row>
  );

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

      <View>
        <Text style={pbk.blockLabel}>{t('learn')}</Text>
        <Text style={pbk.lead}>{pick(chapter.content?.learn, lang)}</Text>
      </View>

      {subs.length > 0 ? (
        <>
          {loose.length > 0 ? <IndexList>{loose.map(row)}</IndexList> : null}
          {subs.map((s) => {
            const cs = cards.filter((x) => x.content?.sub === s.id);
            if (!cs.length) return null;
            return (
              <View key={s.id}>
                <SectTitle
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
