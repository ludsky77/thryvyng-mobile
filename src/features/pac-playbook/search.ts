/**
 * Search — both languages, accents ignored, every card field.
 * A port of the prototype's :713-737.
 *
 * Client-side over the loaded chapter set, which is the design audit's own
 * proposed default for GAP 2: `content` is jsonb with no full-text index, and
 * all 69 cards are 96 KB (docs/recon/playbook-v1-design-audit.md:91-95).
 *
 * The index is built from the cards alone and ENRICHED once the blocks are
 * loaded — the prototype could always reach FORMATIONS / POSITIONS / MOVEMENT
 * because its data was inline, and here those arrive one stage later. Before
 * they do, a formation card is still findable by its own name and hook.
 */

import type { Card, ChapterRow, PlaybookBlocks } from './types';
import type { Bilingual } from './diagram/types';

const norm = (s: unknown): string =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

const both = (o: Bilingual | null | undefined): string => (o ? [o.en, o.es].join(' ') : '');

const STOP = new Set([
  'the', 'a', 'an', 'of', 'to', 'and', 'or', 'in', 'on',
  'el', 'la', 'los', 'las', 'de', 'del', 'y', 'o', 'en', 'un', 'una', 'al',
  'is', 'es',
]);

interface IndexRow {
  key: string;
  name: string;
  cue: string;
  hook: string;
  body: string;
  place: string;
}

export function buildSearchIndex(
  cards: Card[],
  chapters: ChapterRow[],
  blocks: PlaybookBlocks
): IndexRow[] {
  const chByKey = new Map(chapters.map((c) => [c.key, c]));
  return cards.map((c) => {
    const ch = chByKey.get(c.chapter_key);
    const sub = c.content?.sub ? ch?.content?.subs?.find((x) => x.id === c.content.sub) : null;

    // :717-720 — the interactive cards carry their words in a block.
    let extra = '';
    const kind = c.content?.kind;
    if (kind === 'formation' && blocks.formations[c.key]) {
      const F = blocks.formations[c.key];
      extra = [F.label, both(F.idea), ...(F.positions || []).map((p) => p.abbr + ' ' + both(p.role))].join(' ');
    } else if (kind === 'numbers' && blocks.numbers) {
      extra = blocks.numbers.table
        .map((r) => r.n + ' ' + r.abbr + ' ' + both(r.name) + ' ' + both(r.role))
        .join(' ');
    } else if (kind === 'positions' && blocks.positions) {
      extra = blocks.positions.positions.map((p) => p.abbr + ' ' + both(p.attack?.text)).join(' ');
    } else if (kind === 'movement' && blocks.movement) {
      extra = blocks.movement.modes.map((m) => both(m.name) + ' ' + both(m.desc)).join(' ');
    }

    const k = c.content || {};
    return {
      key: c.key,
      name: norm(both(k.name)),
      cue: norm(both(k.cue)),
      hook: norm(both(k.hook)),
      body: norm(
        [
          both(k.see),
          both(k.do),
          both(k.more),
          both(k.read),
          both(k.ifnot),
          both(k.ritual),
          both(k.roles),
          both(k.use),
          k.pointers ? [...(k.pointers.en || []), ...(k.pointers.es || [])].join(' ') : '',
          extra,
        ].join(' ')
      ),
      place: norm([both(ch?.content?.name), both(sub?.name), c.key].join(' ')),
    };
  });
}

/** :727-733 — scored, then capped at 24. Every term must hit something. */
export function searchCards(index: IndexRow[], cards: Card[], q: string): { key: string; score: number }[] {
  const terms = norm(q)
    .split(/\s+/)
    .filter((t) => (t.length > 1 || /\d/.test(t)) && !STOP.has(t));
  if (!terms.length) return [];

  const byKey = new Map(cards.map((c) => [c.key, c]));
  const out: { key: string; score: number }[] = [];

  for (const r of index) {
    let score = 0;
    let ok = true;
    for (const t of terms) {
      let s = 0;
      if (r.name.includes(t)) {
        const words = r.name.split(/[\s\-·]+/);
        s += words.some((w) => w === t) ? 12 : words.some((w) => w.startsWith(t)) ? 9 : 5;
      }
      if (r.cue.includes(t)) s += 5;
      if (r.hook.includes(t)) s += 3;
      if (r.body.includes(t)) s += 1;
      if (r.place.includes(t)) s += 2;
      if (!s) {
        ok = false;
        break;
      }
      score += s;
    }
    if (!ok) continue;
    // A shirt number (1-11) points first to The numbers and the heat maps.
    if (terms.some((t) => /^\d{1,2}$/.test(t) && +t >= 1 && +t <= 11)) {
      const kind = byKey.get(r.key)?.content?.kind;
      if (kind === 'numbers') score += 30;
      if (kind === 'positions') score += 24;
    }
    out.push({ key: r.key, score });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 24);
}

/**
 * :734-737 — highlight on the ORIGINAL text using offsets found in the
 * accent-free copy, so "presion" marks "presión". Returns plain segments so
 * the caller can render <mark> as a React node rather than as markup.
 */
export function highlight(text: string, q: string): { s: string; hit: boolean }[] {
  const terms = norm(q)
    .split(/\s+/)
    .filter((t) => t.length > 1);
  if (!terms.length || !text) return [{ s: text, hit: false }];

  const n = norm(text);
  const marks: [number, number][] = [];
  terms.forEach((t) => {
    let i = n.indexOf(t);
    while (i >= 0) {
      marks.push([i, i + t.length]);
      i = n.indexOf(t, i + t.length);
    }
  });
  if (!marks.length) return [{ s: text, hit: false }];

  marks.sort((a, b) => a[0] - b[0]);
  const out: { s: string; hit: boolean }[] = [];
  let last = 0;
  for (const [a, b] of marks) {
    if (a < last) continue;
    if (a > last) out.push({ s: text.slice(last, a), hit: false });
    out.push({ s: text.slice(a, b), hit: true });
    last = b;
  }
  if (last < text.length) out.push({ s: text.slice(last), hit: false });
  return out;
}
