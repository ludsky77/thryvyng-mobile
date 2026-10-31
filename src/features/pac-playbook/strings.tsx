/**
 * The reader's own words, and how it picks a language — the mobile ADAPT of
 * the web's `strings.ts` (`thrive-and-score` @ `c772111`).
 *
 * The UI dictionary below, `pick()` and `other()` are the web's, verbatim.
 * Only the language SOURCE differs, and it differs by ruling:
 *
 * RULING E-R4 = A — a per-reader toggle, not an app-wide setting. The web's
 * `useLang()` reads and writes `useLanguage()` from
 * `src/contexts/LanguageContext.tsx`, because the web HAS one global language
 * (`localStorage['thryvyng-lang']`, ruling R-3). This app has none: the two
 * places that already offer Spanish keep it in local state on the screen
 * itself (`src/screens/DrillDetailScreen.tsx`,
 * `src/screens/SessionDetailScreen.tsx`). R-3's intent was "no second source
 * of truth"; with no global setting to disagree with, a local toggle creates
 * none. Building the app-wide context is its own prompt (E-R4 option 2) and is
 * NOT Playbook work.
 *
 * So the state lives in the reader shell and reaches the screens through a
 * context that exists only inside this feature — identical ergonomics to the
 * web's `useLang()` at every call site, which is what keeps the six screens
 * and three panels readable side by side with the web's. It resets when the
 * reader is closed, exactly as `DrillDetailScreen`'s toggle does.
 */

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { Bilingual } from './diagram/types';

export type Lang = 'en' | 'es';

const UI = {
  en: {
    contents: 'Contents',
    read: 'read',
    ofcards: 'cards read',
    continue: 'Continue',
    got: 'Got it',
    gotd: 'Got it ✓',
    prev: '‹ Previous',
    next: 'Next ›',
    see: 'What you see',
    do: 'What to do',
    more: 'Why it matters',
    read_: 'Read',
    ifnot: 'If not',
    roles: 'Roles',
    ritual: 'Ritual',
    cue: 'Cue word',
    call: 'Call',
    line: 'Line',
    use: 'Use it',
    link: 'See also',
    quiz: 'Playbook Quiz',
    quizsub: '8 questions · 60 s · new order every time',
    start: 'Start quiz',
    again: 'Play again',
    home: 'Home',
    legend_us: 'us',
    legend_them: 'them',
    legend_pass: 'pass',
    legend_run: 'run',
    cuehdr: 'Your cue',
    loop: 'loop',
    paused: 'paused · tap',
    pend: 'Diagram pending',
    tapit: 'Tap the space',
    readcard: 'Read the card',
    nextq: 'Next',
    results: 'Results',
    gold: 'Gold',
    silver: 'Silver',
    nomedal: 'Keep going',
    score: 'Score',
    question: 'Question',
    card: 'Card',
    of: 'of',
    learn: 'What you will learn',
    chapter: 'Chapter',
    cards: 'cards',
    unread: 'Not yet read',
    opened: 'Opened',
    gotit: 'Got it',
    counts: 'counts',
    logged: 'logged',
  },
  es: {
    contents: 'Índice',
    read: 'leídas',
    ofcards: 'tarjetas leídas',
    continue: 'Continuar',
    got: 'Entendido',
    gotd: 'Entendido ✓',
    prev: '‹ Anterior',
    next: 'Siguiente ›',
    see: 'Lo que ves',
    do: 'Qué hacer',
    more: 'Por qué importa',
    read_: 'Lee',
    ifnot: 'Si no',
    roles: 'Roles',
    ritual: 'Ritual',
    cue: 'Palabra clave',
    call: 'Grito',
    line: 'Línea',
    use: 'Úsala',
    link: 'Ver también',
    quiz: 'Quiz del Playbook',
    quizsub: '8 preguntas · 60 s · orden nuevo cada vez',
    start: 'Empezar',
    again: 'Jugar otra vez',
    home: 'Inicio',
    legend_us: 'nosotros',
    legend_them: 'ellos',
    legend_pass: 'pase',
    legend_run: 'carrera',
    cuehdr: 'Tu señal',
    loop: 'bucle',
    paused: 'pausa · toca',
    pend: 'Diagrama pendiente',
    tapit: 'Toca el espacio',
    readcard: 'Lee la tarjeta',
    nextq: 'Siguiente',
    results: 'Resultados',
    gold: 'Oro',
    silver: 'Plata',
    nomedal: 'Sigue',
    score: 'Puntos',
    question: 'Pregunta',
    card: 'Tarjeta',
    of: 'de',
    learn: 'Qué vas a aprender',
    chapter: 'Capítulo',
    cards: 'tarjetas',
    unread: 'Sin leer',
    opened: 'Abiertas',
    gotit: 'Entendido',
    counts: 'cuenta',
    logged: 'registro',
  },
} as const;

export type UiKey = keyof typeof UI.en;

/** The prototype's T(): a `{en, es}` payload in the reader's language. */
export const pick = (o: Bilingual | null | undefined, lang: Lang): string =>
  o ? o[lang] || o.en || '' : '';

/** The other side of a bilingual pair — the small grey subtitle under a title. */
export const other = (o: Bilingual | null | undefined, lang: Lang): string =>
  o ? (lang === 'en' ? o.es || '' : o.en || '') : '';

/* -------------------------------------------------- the reader's language */

export interface LangState {
  lang: Lang;
  setLang: (l: Lang) => void;
}

/**
 * Default EN, so a screen rendered outside the shell (a test, the harness's
 * board page) still reads rather than throwing. The shell always provides.
 */
const LangContext = createContext<LangState>({ lang: 'en', setLang: () => {} });

/**
 * The reader's own language state, owned by the shell (ruling E-R4 = A).
 * One `useState` per mounted reader; nothing outside this feature sees it.
 */
export function usePlaybookLangState(initial: Lang = 'en'): LangState {
  const [lang, setLang] = useState<Lang>(initial);
  return useMemo(() => ({ lang, setLang }), [lang]);
}

export function PlaybookLangProvider({
  value,
  children,
}: {
  value: LangState;
  children: React.ReactNode;
}) {
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

/**
 * The web's `useLang()`, same four members, reading the reader's own state
 * instead of the app's. Every call site in the screens and panels is
 * therefore identical to the web's.
 */
export function useLang() {
  const { lang, setLang } = useContext(LangContext);
  const t = useCallback((k: UiKey): string => UI[lang][k] || k, [lang]);
  const T = useCallback((o: Bilingual | null | undefined) => pick(o, lang), [lang]);
  return { lang, setLang, t, T };
}
