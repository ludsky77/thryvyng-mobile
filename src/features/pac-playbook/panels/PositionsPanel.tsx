/**
 * Positions & zones — the prototype's positionsPanel(), :599-613.
 *
 * Attacking / defending heat maps over the full pitch, three defensive gears,
 * and a tap-a-number role panel. The blobs and the text come from the
 * `positions` block (`playbook_blocks` kind='positions', one row), and the
 * default shirt number is 6 — the web panel's own (`PositionsPanel.tsx:28-30`).
 *
 * The board is `StillBoard`: the mirrored renderer's own string, with the same
 * render options the web passes (`id`, `heat`, `dim`, `tap`, `lang`), and a
 * geometric `pos-*` hit test in place of the web's `data-el` DOM walk. The
 * heat field's `feGaussianBlur` lives INSIDE the `<svg>` that `heat.ts` emits,
 * so it survives `SvgXml` — M2 confirmed that on the simulator.
 */

import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StillBoard } from '../StillBoard';
import { render } from '../diagram/renderDiagram';
import type { DiagramBlock } from '../diagram/types';
import type { PositionsBlock } from '../types';
import { pick, useLang } from '../strings';
import { Fmt } from '../Fmt';
import { pbk } from '../styles';

const GEARS = ['SET', 'HUNT', 'HOLD'] as const;

export function PositionsPanel({
  block,
  diagram,
}: {
  block: PositionsBlock;
  diagram: DiagramBlock | undefined;
}) {
  const { lang } = useLang();
  const es = lang === 'es';
  const [sel, setSel] = useState<number>(
    () => (block.positions.find((x) => x.n === 6) || block.positions[0]).n
  );
  const [phase, setPhase] = useState<'attack' | 'defend'>('attack');
  const [gear, setGear] = useState<string>('SET');

  const p = block.positions.find((x) => x.n === sel) || block.positions[0];
  const pic = phase === 'attack' ? p.attack : p.defend?.[gear] || p.defend?.SET;
  const keys = pic?.keys ? pick(pic.keys, lang).split(' · ').filter(Boolean) : [];

  const xml = useMemo(
    () =>
      diagram
        ? render(diagram, null, { id: 'possvg', heat: pic?.blobs, dim: p.n, tap: true, lang })
        : '',
    [diagram, pic?.blobs, p.n, lang]
  );

  if (!diagram) return null;

  return (
    <>
      <View style={pbk.segrow}>
        <Pressable
          onPress={() => setPhase('attack')}
          style={[pbk.seg2, pbk.heatbtn, phase === 'attack' && pbk.seg2On]}
        >
          <Text style={[pbk.seg2Text, phase === 'attack' && pbk.seg2OnText]}>
            {es ? 'Mapa de calor · ataque' : 'Attacking heat map'}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setPhase('defend')}
          style={[pbk.seg2, pbk.heatbtn, phase === 'defend' && pbk.seg2On]}
        >
          <Text style={[pbk.seg2Text, phase === 'defend' && pbk.seg2OnText]}>
            {es ? 'Mapa de calor · defensa' : 'Defensive heat map'}
          </Text>
        </Pressable>
      </View>

      {phase === 'defend' ? (
        <View style={pbk.segrow}>
          {GEARS.map((g) => (
            <Pressable
              key={g}
              onPress={() => setGear(g)}
              style={[pbk.seg2, pbk.seg2Small, gear === g && pbk.seg2On]}
            >
              <Text
                style={[pbk.seg2Text, pbk.seg2SmallText, gear === g && pbk.seg2OnText]}
              >
                {pick(block.gears?.[g], lang)}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <StillBoard
        xml={xml}
        diagram={diagram.frames ? diagram.frames[diagram.frames.length - 1].d : diagram}
        caption={es ? 'toca un número' : 'tap a number'}
        onPressPos={(elId) => setSel(Number(elId.slice(4)))}
      />

      <View style={pbk.ramp}>
        <Text style={pbk.rampText}>{es ? 'de visita' : 'visits'}</Text>
        <LinearGradient
          colors={['#10b981', '#e9c54a', '#f08a3c', '#e5484d']}
          locations={[0, 0.38, 0.68, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ flex: 1, height: 8, borderRadius: 4 }}
        />
        <Text style={pbk.rampText}>{es ? 'tu zona' : 'your zone'}</Text>
      </View>

      <View style={pbk.rolepanel}>
        <View style={pbk.rolepanelNum}>
          <Text style={pbk.rolepanelNumText}>{p.n}</Text>
        </View>
        <View style={pbk.rolepanelBody}>
          <Text style={pbk.rolepanelLabel}>
            {p.abbr} ·{' '}
            {phase === 'attack'
              ? es
                ? 'atacando'
                : 'attacking'
              : (es ? 'defendiendo · ' : 'defending · ') + pick(block.gears?.[gear], lang)}
          </Text>
          <Text style={pbk.rolepanelText}>
            <Fmt text={pick(pic?.text, lang)} />
          </Text>
          {keys.length > 0 ? (
            <View style={pbk.keys}>
              {keys.map((k) => (
                <View key={k} style={pbk.keyPill}>
                  <Text style={pbk.keyPillText}>{k}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </View>

      {block.legend ? (
        <View style={pbk.legend}>
          <Text style={pbk.legendText}>{pick(block.legend, lang)}</Text>
        </View>
      ) : null}
    </>
  );
}
