/**
 * The two FORMATIONS-driven panels, the prototype's formationPanel() and
 * numbersPanel(), :666-678.
 *
 * Both read `playbook_blocks` — kind 'formation' keyed by the card's own key,
 * and the single kind 'numbers' row. Their boards are the ones the reader
 * SYNTHESISES (`usePlaybookBook.indexBlocks`), because a formation card
 * carries no diagram of its own; that is why the dots are `pos-*` elements and
 * why the geometric hit test in `StillBoard` can find them.
 *
 * Two components in one file, as on the web: they share one block kind and one
 * board shape, and splitting them would make the web↔mobile file map lie.
 */

import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { StillBoard } from '../StillBoard';
import { render } from '../diagram/renderDiagram';
import type { DiagramBlock } from '../diagram/types';
import type { FormationBlock, NumbersBlock } from '../types';
import { pick, useLang } from '../strings';
import { Fmt } from '../Fmt';
import { pbk } from '../styles';

export function FormationPanel({
  block,
  diagram,
}: {
  block: FormationBlock;
  diagram: DiagramBlock | undefined;
}) {
  const { lang } = useLang();
  const es = lang === 'es';
  const [sel, setSel] = useState<number | null>(null);
  const p = sel != null ? block.positions?.find((x) => x.n === sel) : null;

  const xml = useMemo(
    () =>
      diagram
        ? render(diagram, null, { id: 'possvg', dim: p ? p.n : null, tap: true, lang })
        : '',
    [diagram, p, lang]
  );

  if (!diagram) return null;

  return (
    <>
      <StillBoard
        xml={xml}
        diagram={diagram.frames ? diagram.frames[diagram.frames.length - 1].d : diagram}
        caption={es ? 'toca un número' : 'tap a number'}
        onPressPos={(elId) => setSel(Number(elId.slice(4)))}
      />

      <View style={pbk.rolepanel}>
        <View style={pbk.rolepanelNum}>
          <Text style={pbk.rolepanelNumText}>{p ? p.n : '#'}</Text>
        </View>
        <View style={pbk.rolepanelBody}>
          <Text style={pbk.rolepanelLabel}>
            {p ? `${p.abbr}${block.label ? ' · ' + block.label : ''}` : block.label || ''}
          </Text>
          <Text style={pbk.rolepanelText}>
            <Fmt text={p ? pick(p.role, lang) : pick(block.idea, lang)} />
          </Text>
        </View>
      </View>

      <View style={pbk.legend}>
        <Text style={pbk.legendText}>
          {es
            ? 'Sin líneas planas: triángulos por todo el campo.'
            : 'No flat lines: triangles everywhere.'}
        </Text>
      </View>
    </>
  );
}

export function NumbersPanel({
  block,
  diagram,
}: {
  block: NumbersBlock;
  diagram: DiagramBlock | undefined;
}) {
  const { lang } = useLang();

  const xml = useMemo(() => (diagram ? render(diagram, null, { lang }) : ''), [diagram, lang]);

  return (
    <>
      {diagram ? (
        <StillBoard
          xml={xml}
          diagram={diagram.frames ? diagram.frames[diagram.frames.length - 1].d : diagram}
        />
      ) : null}

      <View style={pbk.numlist}>
        {block.table.map((r) => (
          <View key={String(r.n)} style={pbk.numlistItem}>
            <View style={pbk.numlistNum}>
              <Text style={pbk.numlistNumText}>{r.n}</Text>
            </View>
            <Text style={pbk.numlistAbbr}>{r.abbr}</Text>
            <Text style={pbk.numlistName}>
              {pick(r.name, lang)}
              {'\n'}
              <Text style={pbk.numlistRole}>
                <Fmt text={pick(r.role, lang)} />
              </Text>
            </Text>
          </View>
        ))}
      </View>

      {block.note ? (
        <Text style={pbk.oneMute}>
          <Fmt text={pick(block.note, lang)} />
        </Text>
      ) : null}
    </>
  );
}
