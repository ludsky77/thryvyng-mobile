/**
 * The cover — the prototype's coverHTML(), :777-799.
 *
 * The chalk pitch sketch, the title, how to use the book, the chapter chips
 * and the byline, in that order. The `STEPS` strings below are the web's,
 * verbatim: they describe the READER's behaviour, so they live with the reader
 * rather than in the book's content jsonb.
 *
 * The cover art is the web's own inline SVG — fourteen paths and three
 * circles, coordinate for coordinate — drawn through `react-native-svg`
 * components rather than as markup, because it is written in the source here
 * and not fetched as a string. The prototype's `stroke` / `opacity` /
 * `stroke-dasharray` values are unchanged.
 *
 * `div.cover` wraps its own footer on the web, which is why the cover has no
 * foot doodle band and puts both of its marks in the top band
 * (`doodleArt.ts`, `ZONES.cover = { top: 2, foot: 0 }`). Mobile inherits that
 * from the same ruling data.
 */

import React from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';
import type { ChapterRow } from '../types';
import { pick, useLang } from '../strings';
import { Btn, Cta, Stamp, Tape } from '../ui';
import { pbk } from '../styles';

const STEPS = {
  es: [
    ['Elige un capítulo', 'En el Índice — o toca Continuar y sigue donde ibas.'],
    ['Lee una tarjeta', 'Lo que ves → el tablero (tócalo para pausar) → qué hacer.'],
    [
      'Sigue los enlaces',
      'Los chips verdes llevan a ideas relacionadas; «Volver a…» te regresa a donde estabas.',
    ],
    [
      'Marca «Entendido»',
      'Eso es lo que ve tu coach. Juega el quiz por medallas y deja tus preguntas al final de cada capítulo.',
    ],
  ],
  en: [
    ['Pick a chapter', 'From Contents — or tap Continue to pick up where you left off.'],
    ['Read a card', 'What you see → the board (tap it to pause) → what to do.'],
    [
      'Follow the links',
      'Green chips open related ideas; “Back to…” returns you to where you were.',
    ],
    [
      'Tap “Got it”',
      'That’s what your coach sees. Play the quiz for medals and leave questions at the end of every chapter.',
    ],
  ],
} as const;

/** `.cover-art` — the prototype's chalk pitch sketch, :778. */
function CoverArt() {
  return (
    <Svg width="100%" height={150} viewBox="0 0 340 150" style={{ opacity: 0.9 }}>
      <G fill="none" stroke="#e8ecf2" strokeLinecap="round" strokeLinejoin="round" opacity={0.5}>
        <Path d="M10 140 L330 140" strokeWidth={1} />
        <Path d="M120 140 L120 112 L220 112 L220 140" strokeWidth={1} />
        <Path d="M150 140 L150 128 L190 128 L190 140" strokeWidth={1} />
        <Circle cx={70} cy={70} r={7} strokeWidth={1.6} />
        <Circle cx={150} cy={44} r={7} strokeWidth={1.6} />
        <Circle cx={250} cy={66} r={7} strokeWidth={1.6} />
        <Path d="M110 92 l10 10 m0 -10 l-10 10" strokeWidth={1.6} />
        <Path d="M200 34 l10 10 m0 -10 l-10 10" strokeWidth={1.6} />
        <Path d="M286 102 l10 10 m0 -10 l-10 10" strokeWidth={1.6} />
        <Path d="M78 64 C 100 50, 124 46, 142 46" strokeWidth={1.3} />
        <Path d="M136 41 l7 5 -8 3" strokeWidth={1.3} />
        <Path d="M157 48 C 190 60, 214 70, 242 68" strokeWidth={1.3} strokeDasharray="4 4" />
        <Path d="M236 63 l7 5 -8 3" strokeWidth={1.3} />
        <Path
          d="M70 78 C 76 104, 120 122, 166 124"
          strokeWidth={1.1}
          strokeDasharray="2 4"
          opacity={0.7}
        />
        <Path d="M20 22 q8 -6 16 0 t16 0" strokeWidth={1} opacity={0.6} />
        <Path d="M300 20 l8 -3 M306 30 l9 -2 M24 118 l7 -2" strokeWidth={1} opacity={0.5} />
      </G>
    </Svg>
  );
}

export function CoverScreen({
  chapters,
  author,
  onOpen,
}: {
  chapters: ChapterRow[];
  author: string;
  onOpen: () => void;
}) {
  const { lang } = useLang();
  const es = lang === 'es';
  const steps = STEPS[es ? 'es' : 'en'];

  return (
    <View style={pbk.cover}>
      <CoverArt />

      <View style={pbk.coverTop}>
        <Tape>{es ? 'Edición 1 · 2026–27' : 'Edition 1 · 2026–27'}</Tape>
        <Stamp lines={['PAC', es ? 'Uso del club' : 'Club use']} />
      </View>

      <View>
        <Text style={pbk.coverTitle}>
          PAC{'\n'}Playbook
        </Text>
        <View style={pbk.coverTitleRule} />
      </View>

      <Text style={pbk.coverSub}>
        {es ? 'El libro de jugadas del club' : 'The club’s tactical manual'}
      </Text>
      <Text style={pbk.coverLead}>
        {es
          ? 'Cómo vemos el juego, cómo lo jugamos y cómo pensamos — el mismo idioma para cada equipo PAC, de 5v5 a 11v11, para jugadoras, jugadores y sus familias.'
          : 'How we see the game, how we play it and how we think — one language for every PAC team, from 5v5 to 11v11, for our players and their families.'}
      </Text>

      <View style={pbk.coverHow}>
        <Text style={pbk.blockLabel}>{es ? 'Cómo usarlo' : 'How to use it'}</Text>
        {steps.map((x, i) => (
          <View key={x[0]} style={pbk.coverHowStep}>
            <View style={pbk.coverHowKey}>
              <Text style={pbk.coverHowKeyText}>{i + 1}</Text>
            </View>
            <View style={pbk.coverHowBody}>
              <Text style={pbk.coverHowName}>{x[0]}</Text>
              <Text style={pbk.coverHowText}>{x[1]}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={pbk.coverChs}>
        {chapters.map((c) => (
          <View key={c.key} style={pbk.coverChip}>
            <Text style={pbk.coverChipText}>
              {c.n} · {pick(c.content?.name, lang)}
            </Text>
          </View>
        ))}
      </View>

      <Text style={pbk.coverBy}>{author}</Text>

      <Cta>
        <Btn
          variant="primary"
          label={`${es ? 'Abrir el playbook' : 'Open the playbook'} ›`}
          onPress={onOpen}
        />
      </Cta>
    </View>
  );
}
