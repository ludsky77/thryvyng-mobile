/**
 * TWO TEST CARDS — `__DEV__` ONLY, and not content.
 *
 * PLAYBOOK-DIAGRAM-TABS ships a tab row that supports two to five frames, and
 * PLAYBOOK-KEEPER-ANGLE ships a board that no row in the database asks for
 * yet. Neither can be LOOKED at on a simulator from the real book: the six
 * frames cards in `playbook_blocks` all carry exactly two frames, and no card
 * carries `content.kind = 'keeperangle'` until Lu's content lands.
 *
 * WHY THIS IS A SEPARATE FILE AND NOT AN EDIT TO THE FROZEN JSON.
 * `dev/pac-playbook-v2-FINAL-data.json` is a BYTE-IDENTICAL mirror of the web
 * repo's copy of the file the production seed was built from, and `MIRROR.md`
 * carries its provenance row and a one-command `diff` as the only cheap proof
 * it has not drifted. Adding a test card to it would break that check and
 * would put invented content in the file whose whole job is to hold none. So
 * the fixture is a FUNCTION over the offline book instead: the frozen file
 * stays byte-identical, and what the harness shows is clearly marked as this
 * file's.
 *
 * HOW IT IS REACHED, and how it stays out of a build. The harness applies it
 * only when the deep link asks — `thryvyng://playbook-dev?open=reader&fix=1` —
 * so every other harness screen still shows the book the server serves. It
 * ships in no production bundle for the same reason the harness does not: the
 * only import path to either is inside `__DEV__` gates Metro folds to a
 * constant and drops (`AppNavigator.tsx:79-80`). `MARK` below is the string to
 * grep an export for; it must not appear.
 *
 * WHERE THE CARDS SIT. Both go in `principles`, which is the only chapter with
 * enough sections to show what they need: the five-frame card takes `switches`
 * (3rd section, teal) so the active tab wears a tone that is plainly not the
 * book's green, and the keeper card takes `fingerprints` (5th section) so it
 * wears `ice` — the tone PLAYBOOK-SECTION-TONE-5 added, which no existing card
 * in the harness could show on a card screen.
 */

import type { DiagramBlock } from '../diagram/types';
import type { Card } from '../types';
import type { OfflineBook } from '../usePlaybookBook';

/** The grep token. If an export contains this, the fixture shipped. */
export const MARK = 'PLAYBOOK-DEV-TESTCARDS';

const CHAPTER = 'principles';

/* ------------------------------------------------- the five-frame diagram */

/**
 * Five frames, each a visibly different picture with its own beats, so the tab
 * row can be checked for the things that actually break: that tab 1 is
 * selected on open (not the last frame, which is what the board drew before),
 * that pressing a tab changes the picture AND the caption AND the beat row,
 * and that five cells fit a phone's width.
 *
 * The geometry is the renderer's own vocabulary on its `zoom-goal-top`
 * backdrop — attack UP, goal line at y = 3.5, posts at x = 41 and 59
 * (`renderDiagram.ts:116-120`). Nothing here is a coaching claim; it is a
 * sequence chosen to look different five times.
 */
const FIVE_FRAMES: DiagramBlock = {
  crossfade: 400,
  frames: [
    {
      cap: { en: 'Set the shape — three across, ball on the left', es: 'Forma — tres en línea, balón por la izquierda' },
      d: {
        backdrop: 'zoom-goal-top',
        total: 1400,
        beats: [
          { at: 0, label: { en: '1 · Set', es: '1 · Colócate' } },
          { at: 500, label: { en: '2 · Look up', es: '2 · Mira' } },
        ],
        elements: [
          { id: 'z', type: 'zone', x: 50, y: 50, w: 100, h: 9, opacity: 0.12 },
          { id: 'p1', type: 'player', x: 25, y: 50, size: 3.4, tag: '6' },
          { id: 'p2', type: 'player', x: 50, y: 44, size: 3.4, tag: '8' },
          { id: 'p3', type: 'player', x: 75, y: 50, size: 3.4, tag: '7' },
          { id: 'b', type: 'ball', x: 25, y: 50 },
        ],
      },
    },
    {
      cap: { en: 'First pass — inside, to the 8', es: 'Primer pase — por dentro, al 8' },
      d: {
        backdrop: 'zoom-goal-top',
        total: 1500,
        beats: [
          { at: 0, label: { en: '1 · Pass', es: '1 · Pase' } },
          { at: 500, label: { en: '2 · Received', es: '2 · Controla' } },
        ],
        elements: [
          { id: 'p1', type: 'player', x: 25, y: 50, size: 3.4, tag: '6' },
          { id: 'p2', type: 'player', x: 50, y: 44, size: 3.4, tag: '8' },
          { id: 'p3', type: 'player', x: 75, y: 50, size: 3.4, tag: '7' },
          { id: 'ps', type: 'pass', points: [[25, 50], [50, 44]], at: 0, dur: 500 },
          { id: 'b', type: 'ball', follow: 'ps', x: 25, y: 50 },
        ],
      },
    },
    {
      cap: { en: 'Third man — the 7 goes early', es: 'Tercer hombre — el 7 arranca antes' },
      d: {
        backdrop: 'zoom-goal-top',
        total: 1900,
        beats: [
          { at: 0, label: { en: '1 · They step', es: '1 · Se acercan' } },
          { at: 300, label: { en: '2 · Run', es: '2 · Carrera' } },
          { at: 900, label: { en: '3 · Played', es: '3 · Servido' } },
        ],
        elements: [
          { id: 'o1', type: 'opponent', x: 60, y: 40, size: 3.4 },
          { id: 'p2', type: 'player', x: 50, y: 44, size: 3.4, tag: '8' },
          { id: 'rn', type: 'run', points: [[75, 50], [78, 34]], at: 300, dur: 600, dots: true },
          { id: 'p3', type: 'player', x: 75, y: 50, size: 3.4, tag: '7', follow: 'rn' },
          { id: 'ps', type: 'pass', points: [[50, 44], [78, 34]], at: 900, dur: 500 },
          { id: 'b', type: 'ball', follow: 'ps', x: 50, y: 44 },
        ],
      },
    },
    {
      cap: { en: 'Switch it — all the way to the far side', es: 'Cambia el juego — al lado contrario' },
      d: {
        backdrop: 'zoom-goal-top',
        total: 1800,
        beats: [
          { at: 0, label: { en: '1 · Switch', es: '1 · Cambio' } },
          { at: 700, label: { en: '2 · Free', es: '2 · Libre' } },
        ],
        elements: [
          { id: 'o1', type: 'opponent', x: 62, y: 32, size: 3.4 },
          { id: 'o2', type: 'opponent', x: 50, y: 26, size: 3.4 },
          { id: 'ps', type: 'pass', points: [[78, 34], [33, 26]], at: 0, dur: 700 },
          { id: 'p3', type: 'player', x: 78, y: 34, size: 3.4, tag: '7' },
          { id: 'rg', type: 'ring', x: 33, y: 26, size: 7, at: 700, dur: 400 },
          { id: 'p1', type: 'player', x: 33, y: 26, size: 3.4, tag: '11' },
          { id: 'b', type: 'ball', follow: 'ps', x: 78, y: 34 },
        ],
      },
    },
    {
      cap: { en: 'Finish — near post, low and hard', es: 'Define — primer palo, raso y fuerte' },
      d: {
        backdrop: 'zoom-goal-top',
        total: 1700,
        beats: [
          { at: 0, label: { en: '1 · Carry', es: '1 · Conduce' } },
          { at: 600, label: { en: '2 · Strike', es: '2 · Remata' } },
        ],
        elements: [
          { id: 'cn', type: 'cone', x: 50, y: 22, to: [50, 8], len: 13, spread: 20 },
          { id: 'bx', type: 'box', x: 72, y: 18, text: 'NEAR POST', text_es: 'PRIMER PALO' },
          { id: 'rn', type: 'run', points: [[33, 26], [44, 20]], at: 0, dur: 600, dots: true },
          { id: 'p1', type: 'player', x: 33, y: 26, size: 3.4, tag: '11', follow: 'rn' },
          { id: 'ps', type: 'pass', points: [[44, 20], [43, 5]], at: 600, dur: 450 },
          { id: 'b', type: 'ball', follow: 'ps', x: 44, y: 20 },
          { id: 'xm', type: 'xmark', x: 43, y: 4, size: 2.4 },
        ],
      },
    },
  ],
};

/* ------------------------------------------------------------- the two cards */

const card = (
  key: string,
  sub: string,
  sort: number,
  content: Card['content']
): Card => ({
  id: key,
  chapter_id: CHAPTER,
  chapter_key: CHAPTER,
  key,
  sort,
  style: '',
  diagram_key: null,
  content: { ...content, sub },
  published: true,
});

const FIVE_CARD = card('ZZ5', 'switches', 901, {
  name: { en: '[DEV] Five steps', es: '[DEV] Cinco pasos' },
  hook: { en: 'A five-frame figure, for the tab row', es: 'Una figura de cinco cuadros, para las pestañas' },
  see: {
    en: 'Five pictures of one move. Tap a step to see that moment on its own.',
    es: 'Cinco imágenes de una jugada. Toca un paso para ver ese momento.',
  },
  do: {
    en: 'Press each step. The picture, the caption under it and the beat row all change together.',
    es: 'Pulsa cada paso. La imagen, el pie de foto y la fila de tiempos cambian juntos.',
  },
  more: {
    en: `Dev fixture ${MARK} — not content, and in no production build.`,
    es: `Fixture de desarrollo ${MARK} — no es contenido, y no va en ninguna build de producción.`,
  },
  cue: { en: 'Step by step', es: 'Paso a paso' },
});

const KEEPER_CARD = card('ZZK', 'fingerprints', 902, {
  name: { en: '[DEV] Keeper angles', es: '[DEV] Ángulos del portero' },
  hook: { en: 'The angle board, before its content exists', es: 'El tablero de ángulos, antes de su contenido' },
  see: {
    en: 'The shooting triangle runs from the ball to both posts. The keeper stands on the rope, on the line that splits it.',
    es: 'El triángulo de tiro va del balón a los dos palos. El portero se coloca sobre la cuerda, en la línea que lo divide.',
  },
  do: {
    en: 'Drag the ball wide and watch the angle close. Then be the keeper and try to beat the spot it picks.',
    es: 'Arrastra el balón hacia la banda y mira cómo se cierra el ángulo. Luego ponte de portero e intenta superar su sitio.',
  },
  more: {
    en: `Dev fixture ${MARK} — not content, and in no production build.`,
    es: `Fixture de desarrollo ${MARK} — no es contenido, y no va en ninguna build de producción.`,
  },
  cue: { en: 'Near post first', es: 'Primero el primer palo' },
  kind: 'keeperangle',
});

/**
 * The offline book with the two test cards in it. A NEW object every time —
 * the base book is never mutated, so a harness screen opened without `fix=1`
 * is the book the server serves.
 */
export function withTestCards(base: OfflineBook): OfflineBook {
  return {
    ...base,
    content: {
      ...base.content,
      cards: [...base.content.cards, FIVE_CARD, KEEPER_CARD],
    },
    blocks: {
      ...base.blocks,
      diagrams: { ...base.blocks.diagrams, ZZ5: FIVE_FRAMES },
    },
  };
}
