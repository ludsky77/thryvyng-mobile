/**
 * Contents — the prototype's homeHTML() + searchBoxHTML() + wireSearch(),
 * :555-576 and :738-750.
 *
 * The search box sits above the index and swaps it for results as you type,
 * which is the prototype's behaviour exactly: one screen, two bodies. The
 * index, the matching and the highlighting are the MIRRORED `search.ts` —
 * `buildSearchIndex` / `searchCards` / `highlight`, byte-identical to the
 * web's — so a word that finds a card in one app finds it in the other.
 *
 * The read counts and the Continue button are the player's; a staff viewer
 * (R-1: read-only book, no player chosen) gets the index, the search and the
 * cover link, and nobody's progress.
 *
 * TWO MOBILE DIFFERENCES, both of them `<input type="search">` not existing:
 * the clear button is drawn rather than supplied by the browser (the web hides
 * WebKit's own with `::-webkit-search-cancel-button`), and `autoFocus` is
 * `autoFocus` on a `TextInput` instead of an imperative `.focus()` — the
 * header's search button still lands the caret in the box, which is what that
 * effect is for.
 */

import React, { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import type { Card, ChapterRow, PlaybookBlocks, QuizResultRow } from '../types';
import { other, pick, useLang } from '../strings';
import { buildSearchIndex, highlight, searchCards } from '../search';
import { Btn, Chev, Cta, Icon, IndexList, Medal, Row, Stamp, Tape, TopHead } from '../ui';
import { pbk } from '../styles';
import { color } from '../theme';

interface ContentsScreenProps {
  chapters: ChapterRow[];
  cards: Card[];
  blocks: PlaybookBlocks;
  /** null = staff read-only view: no progress anywhere on the screen. */
  got: Set<string> | null;
  quizResult: QuizResultRow | null;
  rev: string;
  query: string;
  setQuery: (q: string) => void;
  autoFocusSearch: boolean;
  onOpenChapter: (chapterKey: string) => void;
  onOpenCard: (cardKey: string, fromSearch?: boolean) => void;
  onOpenCover: () => void;
  onOpenQuiz: () => void;
  onContinue: () => void;
  /** Name of the next unread card, printed small on the Continue button. */
  continueLabel: string;
}

export function ContentsScreen(props: ContentsScreenProps) {
  const {
    chapters,
    cards,
    blocks,
    got,
    quizResult,
    rev,
    query,
    setQuery,
    autoFocusSearch,
    onOpenChapter,
    onOpenCard,
    onOpenCover,
    onOpenQuiz,
    onContinue,
    continueLabel,
  } = props;
  const { lang, t } = useLang();
  const es = lang === 'es';
  const [focused, setFocused] = useState(false);

  const index = useMemo(() => buildSearchIndex(cards, chapters, blocks), [cards, chapters, blocks]);
  const hits = useMemo(
    () => (query.trim() ? searchCards(index, cards, query) : []),
    [index, cards, query]
  );
  const byKey = useMemo(() => new Map(cards.map((c) => [c.key, c])), [cards]);
  const chByKey = useMemo(() => new Map(chapters.map((c) => [c.key, c])), [chapters]);

  const searching = !!query.trim();
  const total = cards.length;
  const gotTotal = got ? cards.filter((c) => got.has(c.id)).length : 0;
  const medal = quizResult && quizResult.best_medal !== 'none' ? quizResult.best_medal : null;

  /** `.sres mark` — the matched run, green-tinted. */
  const mark = (text: string) =>
    highlight(text, query).map((seg, i) =>
      seg.hit ? (
        <Text key={i} style={pbk.mark}>
          {seg.s}
        </Text>
      ) : (
        <Text key={i}>{seg.s}</Text>
      )
    );

  return (
    <>
      <TopHead
        tape={<Tape xl>{t('contents')}</Tape>}
        stamp={<Stamp lines={rev.split(' · ')} />}
      />

      <View style={[pbk.searchbox, focused && pbk.searchboxOn]}>
        <Icon name="search" stroke={color.mute} />
        <TextInput
          style={pbk.searchInput}
          value={query}
          onChangeText={setQuery}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          autoFocus={autoFocusSearch}
          autoCorrect={false}
          autoCapitalize="none"
          placeholder={
            es
              ? 'Buscar: presión, finta, el 6, cambio de juego…'
              : 'Search: press, juke, the 6, switch the play…'
          }
          placeholderTextColor={color.dim}
          accessibilityLabel={es ? 'Buscar en el playbook' : 'Search the playbook'}
          returnKeyType="search"
        />
        {query ? (
          <Pressable
            onPress={() => setQuery('')}
            accessibilityRole="button"
            accessibilityLabel={es ? 'Borrar' : 'Clear'}
            hitSlop={8}
          >
            <Text style={pbk.searchClear}>×</Text>
          </Pressable>
        ) : null}
      </View>

      {searching ? (
        hits.length === 0 ? (
          <Text style={pbk.snote}>
            {es
              ? 'Nada con esas palabras. Prueba otra, en inglés o español.'
              : 'Nothing matches. Try another word, in English or Spanish.'}
          </Text>
        ) : (
          <>
            <Text style={pbk.snote}>
              {hits.length} {es ? 'resultados' : 'results'}
            </Text>
            <View style={pbk.sres}>
              {hits.map((hit) => {
                const c = byKey.get(hit.key);
                if (!c) return null;
                const ch = chByKey.get(c.chapter_key);
                const sub = c.content?.sub
                  ? ch?.content?.subs?.find((x) => x.id === c.content.sub)
                  : null;
                return (
                  <Pressable
                    key={c.key}
                    style={pbk.hit}
                    onPress={() => onOpenCard(c.key, true)}
                    accessibilityRole="button"
                  >
                    <Text style={pbk.hitEyebrow}>
                      {pick(ch?.content?.name, lang)}
                      {sub ? ' · ' + pick(sub.name, lang) : ''}
                    </Text>
                    <Text style={pbk.hitName}>{mark(pick(c.content?.name, lang))}</Text>
                    <Text style={pbk.hitBody}>
                      {mark(pick(c.content?.hook, lang) || pick(c.content?.see, lang))}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )
      ) : (
        <View>
          {got ? (
            <Text style={pbk.count}>
              {gotTotal} {t('of')} {total} {t('ofcards')}
            </Text>
          ) : null}

          <IndexList>
            {chapters.map((c) => {
              const chCards = cards.filter((x) => x.chapter_key === c.key);
              const g = got ? chCards.filter((x) => got.has(x.id)).length : 0;
              const pct = chCards.length ? Math.round((g / chCards.length) * 100) : 0;
              return (
                <Row
                  key={c.key}
                  num={String(c.n).padStart(2, '0')}
                  right={<Chev />}
                  onPress={() => onOpenChapter(c.key)}
                >
                  <Text style={pbk.rowName}>
                    {pick(c.content?.name, lang)}
                    <Text style={pbk.rowEm}>{'  ' + other(c.content?.name, lang)}</Text>
                  </Text>
                  <Text style={pbk.rowDesc}>{pick(c.content?.learn, lang)}</Text>
                  {got ? (
                    <View style={pbk.prog}>
                      <View style={pbk.bar}>
                        <View style={[pbk.barFill, { width: `${pct}%` }]} />
                      </View>
                      <Text style={[pbk.pct, !g && pbk.pctZero]}>
                        {g} {t('of')} {chCards.length} {t('read')}
                      </Text>
                    </View>
                  ) : null}
                </Row>
              );
            })}
          </IndexList>

          <Row right={<Chev />} onPress={onOpenCover}>
            <Text style={[pbk.rowName, pbk.rowNameSm]}>
              {es ? 'Cómo usar este libro' : 'How to use this book'}
            </Text>
          </Row>
        </View>
      )}

      {got ? (
        <Row
          right={<Chev />}
          onPress={onOpenQuiz}
          style={{
            borderWidth: 1,
            borderColor: color.line2,
            backgroundColor: color.card,
            paddingHorizontal: 14,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[pbk.rowName, pbk.rowNameSm]}>{t('quiz')}</Text>
            {medal ? <Medal medal={medal} /> : null}
          </View>
          <Text style={pbk.rowDesc}>{t('quizsub')}</Text>
        </Row>
      ) : null}

      {got ? (
        <Cta>
          <Btn
            variant="primary"
            label={t('continue')}
            small={`· ${continueLabel}`}
            icon={<Icon name="play" size={16} stroke={color.greenInk} />}
            onPress={onContinue}
          />
        </Cta>
      ) : null}
    </>
  );
}
