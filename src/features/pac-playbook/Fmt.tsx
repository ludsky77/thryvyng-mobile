/**
 * The prototype's fmt(), :389 — `**word**` is a bold green key term.
 *
 * The web splits the string into React nodes rather than handing book content
 * to `dangerouslySetInnerHTML` (`thrive-and-score` @ `c772111`, `Fmt.tsx`).
 * Mobile does the same split; only the leaf changes — `<b className="hl">`
 * becomes a nested `<Text style={pbk.hl}>`, which inherits the surrounding
 * size and weight the way the web's `font-size:inherit` does
 * (`playbook.css`, `b.hl`).
 *
 * It returns bare `<Text>` children, NOT a wrapper: every caller already has a
 * `<Text>` with the right size and colour, and nesting is how RN carries that
 * down. A wrapper here would reset the line height of every block in the book.
 */

import React, { Fragment } from 'react';
import { Text } from 'react-native';
import { pbk } from './styles';

const TERM = /\*\*(.+?)\*\*/g;

export function Fmt({ text }: { text: string | null | undefined }) {
  const s = text ?? '';
  if (!s) return null;
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of s.matchAll(TERM)) {
    const i = m.index ?? 0;
    if (i > last) out.push(<Fragment key={`t${last}`}>{s.slice(last, i)}</Fragment>);
    out.push(
      <Text style={pbk.hl} key={`b${i}`}>
        {m[1]}
      </Text>
    );
    last = i + m[0].length;
  }
  if (last < s.length) out.push(<Fragment key={`t${last}`}>{s.slice(last)}</Fragment>);
  return <>{out}</>;
}
