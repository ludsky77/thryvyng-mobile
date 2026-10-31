/**
 * Three REAL diagrams for the __DEV__ harness, copied out of the web repo's
 * frozen data file — `thrive-and-score` @ `83a3686`,
 * `docs/playbook/pac-playbook-v2-FINAL-data.json`, which is the same content
 * the prod seed (`20261028190001_playbook_v1_seed.sql`) inserts into
 * `playbook_blocks.data`. Nothing here is invented: no coordinate, no string.
 *
 * Why these three:
 *
 *   PLAIN  `F0` — the four actions loop. `backdrop: 'none'`, boxes + a label,
 *          and FIVE elements carrying `text_es`, so the EN/ES toggle visibly
 *          changes the picture (ruling E-R4 = A, local state).
 *   HEAT   `F3` (full pitch, 24 elements) under the CDM's attacking blobs.
 *          The blobs are `positions[n=6].attack.blobs`, verbatim, and 6 is
 *          the web panel's own default (`PositionsPanel.tsx:28-30`). The
 *          PAIRING is this harness's: see FOUND — no seeded diagram carries
 *          the `pos-*` elements the positions panel looks for, so there is no
 *          shipped diagram+heat pair to copy. The render path is identical
 *          (`RenderOptions.heat`, the `feGaussianBlur` filter in `heat.ts`).
 *   TAP    `P1` (zoom-goal) — the board behind quiz question `q011`, the only
 *          `tap` question on that card. It has no explicit `target`, so
 *          `tapTarget()` derives one from its last `pass` (`p3`), exactly as
 *          the web and the server do.
 *
 * `src/features/pac-playbook/dev/` is __DEV__-only. Nothing outside `dev/`
 * imports this file.
 */

import type { DiagramBlock } from '../diagram/types';
import type { HeatBlob } from '../diagram/heat';

export interface Fixture {
  key: string;
  label: string;
  block: DiagramBlock;
  heat?: HeatBlob[];
  /** Shown under a tap board: the question the real quiz asks over it. */
  prompt?: { en: string; es: string };
  /** The bilingual description of the answer, from the quiz row. */
  answer?: { en: string; es: string };
}

/** `diagrams.F0` — verbatim. */
export const PLAIN_F0 = {
  "backdrop": "none",
  "h": 60,
  "total": 4800,
  "hold": 1500,
  "beats": [
    {
      "at": 0,
      "label": {
        "en": "1 · Defend",
        "es": "1 · Defender"
      }
    },
    {
      "at": 900,
      "label": {
        "en": "2 · Regain",
        "es": "2 · Recuperar"
      }
    },
    {
      "at": 1800,
      "label": {
        "en": "3 · Create",
        "es": "3 · Gestar"
      }
    },
    {
      "at": 2700,
      "label": {
        "en": "4 · Finish",
        "es": "4 · Definir"
      }
    }
  ],
  "cue": {
    "en": "Finishing leads straight back to defending — the loop never stops.",
    "es": "Definir lleva directo a defender — el ciclo nunca para."
  },
  "elements": [
    {
      "id": "bDef",
      "type": "box",
      "x": 22,
      "y": 14,
      "w": 24,
      "text": "DEFEND",
      "text_es": "DEFENDER"
    },
    {
      "id": "bReg",
      "type": "box",
      "x": 78,
      "y": 14,
      "w": 24,
      "text": "REGAIN",
      "text_es": "RECUPERAR"
    },
    {
      "id": "bCre",
      "type": "box",
      "x": 78,
      "y": 46,
      "w": 24,
      "text": "CREATE",
      "text_es": "GESTAR"
    },
    {
      "id": "bFin",
      "type": "box",
      "x": 22,
      "y": 46,
      "w": 24,
      "text": "FINISH",
      "text_es": "DEFINIR"
    },
    {
      "id": "a1",
      "type": "pass",
      "points": [
        [
          35,
          14
        ],
        [
          65,
          14
        ]
      ],
      "at": 0,
      "dur": 600,
      "weight": 0.8
    },
    {
      "id": "a2",
      "type": "pass",
      "points": [
        [
          78,
          19
        ],
        [
          78,
          41
        ]
      ],
      "at": 900,
      "dur": 600,
      "weight": 0.8
    },
    {
      "id": "a3",
      "type": "pass",
      "points": [
        [
          65,
          46
        ],
        [
          35,
          46
        ]
      ],
      "at": 1800,
      "dur": 600,
      "weight": 0.8
    },
    {
      "id": "a4",
      "type": "pass",
      "points": [
        [
          22,
          41
        ],
        [
          22,
          19
        ]
      ],
      "at": 2700,
      "dur": 600,
      "weight": 0.8
    },
    {
      "id": "why",
      "type": "label",
      "x": 50,
      "y": 30,
      "size": 3.6,
      "text": "space · time · deception",
      "text_es": "espacio · tiempo · engaño"
    }
  ]
} as DiagramBlock;

/** `diagrams.F3` — verbatim. */
export const PITCH_F3 = {
  "backdrop": "full-pitch",
  "total": 5900,
  "hold": 1500,
  "beats": [
    {
      "at": 0,
      "label": {
        "en": "1 · Build — calm",
        "es": "1 · Construir — calma"
      }
    },
    {
      "at": 1400,
      "label": {
        "en": "2 · Progress",
        "es": "2 · Progresar"
      }
    },
    {
      "at": 2950,
      "label": {
        "en": "3 · Attack — risk",
        "es": "3 · Atacar — riesgo"
      }
    }
  ],
  "cue": {
    "en": "Each third line the ball crosses changes your job — calm, quicker, fast.",
    "es": "Cada línea de tercio que cruza el balón cambia tu tarea — calma, más rápido, rápido."
  },
  "elements": [
    {
      "id": "L3a",
      "type": "reference",
      "points": [
        [
          33.3,
          3
        ],
        [
          33.3,
          137
        ]
      ],
      "weight": 0.6,
      "opacity": 0.85
    },
    {
      "id": "L3b",
      "type": "reference",
      "points": [
        [
          66.7,
          3
        ],
        [
          66.7,
          137
        ]
      ],
      "weight": 0.6,
      "opacity": 0.85
    },
    {
      "id": "zOur",
      "type": "zone",
      "x": 50.0,
      "y": 116.5,
      "w": 100,
      "h": 47,
      "opacity": 0.08
    },
    {
      "id": "zMid",
      "type": "zone",
      "x": 50.0,
      "y": 70.0,
      "w": 100,
      "h": 46,
      "opacity": 0.08
    },
    {
      "id": "zThr",
      "type": "zone",
      "x": 50.0,
      "y": 23.5,
      "w": 100,
      "h": 47,
      "opacity": 0.08
    },
    {
      "id": "t1",
      "type": "reference",
      "points": [
        [
          0,
          47
        ],
        [
          100,
          47
        ]
      ],
      "weight": 0.5
    },
    {
      "id": "t2",
      "type": "reference",
      "points": [
        [
          0,
          93
        ],
        [
          100,
          93
        ]
      ],
      "weight": 0.5
    },
    {
      "id": "l1",
      "type": "reference",
      "points": [
        [
          20,
          0
        ],
        [
          20,
          140
        ]
      ],
      "weight": 0.3,
      "opacity": 0.12
    },
    {
      "id": "l2",
      "type": "reference",
      "points": [
        [
          40,
          0
        ],
        [
          40,
          140
        ]
      ],
      "weight": 0.3,
      "opacity": 0.12
    },
    {
      "id": "l3",
      "type": "reference",
      "points": [
        [
          60,
          0
        ],
        [
          60,
          140
        ]
      ],
      "weight": 0.3,
      "opacity": 0.12
    },
    {
      "id": "l4",
      "type": "reference",
      "points": [
        [
          80,
          0
        ],
        [
          80,
          140
        ]
      ],
      "weight": 0.3,
      "opacity": 0.12
    },
    {
      "id": "p1",
      "type": "pass",
      "points": [
        [
          33,
          115
        ],
        [
          14,
          100.5
        ]
      ],
      "at": 0,
      "dur": 1200,
      "weight": 0.8,
      "dots": true
    },
    {
      "id": "p2",
      "type": "pass",
      "points": [
        [
          14,
          100
        ],
        [
          36,
          77
        ]
      ],
      "at": 1400,
      "dur": 1450,
      "weight": 0.8,
      "dots": true
    },
    {
      "id": "p3",
      "type": "pass",
      "points": [
        [
          36,
          77
        ],
        [
          18,
          46.5
        ]
      ],
      "at": 2950,
      "dur": 1450,
      "weight": 0.8,
      "cue": true
    },
    {
      "id": "gk",
      "type": "player",
      "x": 50,
      "y": 133,
      "size": 2.6
    },
    {
      "id": "cb1",
      "type": "player",
      "x": 36,
      "y": 118,
      "size": 2.6
    },
    {
      "id": "cb2",
      "type": "player",
      "x": 64,
      "y": 118,
      "size": 2.6
    },
    {
      "id": "fb",
      "type": "player",
      "x": 12,
      "y": 97,
      "size": 2.6
    },
    {
      "id": "cm",
      "type": "player",
      "x": 38,
      "y": 73.5,
      "size": 2.6
    },
    {
      "id": "w",
      "type": "player",
      "x": 17,
      "y": 43,
      "size": 2.6
    },
    {
      "id": "o1",
      "type": "opponent",
      "x": 40,
      "y": 100,
      "size": 2.6
    },
    {
      "id": "o2",
      "type": "opponent",
      "x": 50,
      "y": 70,
      "size": 2.6
    },
    {
      "id": "o3",
      "type": "opponent",
      "x": 64,
      "y": 46,
      "size": 2.6
    },
    {
      "id": "ball",
      "type": "ball",
      "x": 33,
      "y": 115,
      "seq": [
        "p1",
        "p2",
        "p3"
      ]
    }
  ]
} as DiagramBlock;

/** `positions[n=6].attack.blobs` — verbatim. */
export const CDM_ATTACK_BLOBS = [
  {
    "x": 50,
    "y": 86,
    "r": 16,
    "w": 1.0
  },
  {
    "x": 50,
    "y": 72,
    "r": 15,
    "w": 0.9
  },
  {
    "x": 42,
    "y": 96,
    "r": 12,
    "w": 0.6
  },
  {
    "x": 58,
    "y": 96,
    "r": 12,
    "w": 0.6
  },
  {
    "x": 50,
    "y": 58,
    "r": 14,
    "w": 0.6
  },
  {
    "x": 50,
    "y": 45,
    "r": 12,
    "w": 0.4
  },
  {
    "x": 50,
    "y": 112,
    "r": 10,
    "w": 0.3
  },
  {
    "x": 50,
    "y": 28,
    "r": 9,
    "w": 0.25
  }
] as HeatBlob[];

/** `diagrams.P1` — verbatim. */
export const TAP_P1 = {
  "backdrop": "zoom-goal",
  "total": 5800,
  "hold": 1500,
  "beats": [
    {
      "at": 0,
      "label": {
        "en": "0 · Press comes",
        "es": "0 · Llega la presión"
      }
    },
    {
      "at": 400,
      "label": {
        "en": "1 · Back to GK",
        "es": "1 · Atrás a la portería"
      }
    },
    {
      "at": 2000,
      "label": {
        "en": "2 · New angle",
        "es": "2 · Nuevo ángulo"
      }
    },
    {
      "at": 2900,
      "label": {
        "en": "3 · Forward",
        "es": "3 · Adelante"
      }
    }
  ],
  "cue": {
    "en": "The ball going back is not backward — the angle opens behind the press.",
    "es": "El balón hacia atrás no es retroceder — el ángulo se abre detrás de la presión."
  },
  "elements": [
    {
      "id": "rS",
      "type": "run",
      "points": [
        [
          36,
          38
        ],
        [
          33,
          45
        ]
      ],
      "at": 0,
      "dur": 1200,
      "ease": "in",
      "weight": 0.7,
      "color": "them"
    },
    {
      "id": "r6",
      "type": "run",
      "points": [
        [
          50,
          30
        ],
        [
          44,
          42
        ]
      ],
      "at": 400,
      "dur": 1900,
      "ease": "in",
      "weight": 0.7
    },
    {
      "id": "p1",
      "type": "pass",
      "points": [
        [
          33,
          52
        ],
        [
          46,
          59
        ]
      ],
      "at": 400,
      "dur": 925,
      "weight": 0.8,
      "cue": true
    },
    {
      "id": "o1",
      "type": "option",
      "points": [
        [
          54,
          59
        ],
        [
          67,
          52
        ]
      ],
      "at": 1400,
      "dur": 400,
      "until": 2000
    },
    {
      "id": "rO2",
      "type": "run",
      "points": [
        [
          58,
          36
        ],
        [
          54,
          44
        ]
      ],
      "at": 1600,
      "dur": 1500,
      "ease": "in",
      "weight": 0.7,
      "color": "them"
    },
    {
      "id": "p2",
      "type": "pass",
      "points": [
        [
          54,
          59
        ],
        [
          66,
          52
        ]
      ],
      "at": 2000,
      "dur": 700,
      "weight": 0.8
    },
    {
      "id": "p3",
      "type": "pass",
      "points": [
        [
          73,
          49
        ],
        [
          92,
          24
        ]
      ],
      "at": 2900,
      "dur": 1300,
      "weight": 0.8
    },
    {
      "id": "GK",
      "type": "player",
      "x": 50,
      "y": 60,
      "size": 3.4,
      "tag": "GK"
    },
    {
      "id": "CB1",
      "type": "player",
      "x": 30,
      "y": 50,
      "size": 3.4
    },
    {
      "id": "CB2",
      "type": "player",
      "x": 70,
      "y": 50,
      "size": 3.4
    },
    {
      "id": "FB1",
      "type": "player",
      "x": 5,
      "y": 21,
      "size": 3.4
    },
    {
      "id": "FB2",
      "type": "player",
      "x": 95,
      "y": 21,
      "size": 3.4
    },
    {
      "id": "M6",
      "type": "player",
      "x": 50,
      "y": 30,
      "size": 3.4,
      "tag": "6",
      "follow": "r6"
    },
    {
      "id": "S",
      "type": "opponent",
      "x": 36,
      "y": 38,
      "size": 3.4,
      "follow": "rS"
    },
    {
      "id": "O2",
      "type": "opponent",
      "x": 58,
      "y": 36,
      "size": 3.4,
      "follow": "rO2"
    },
    {
      "id": "ball",
      "type": "ball",
      "x": 33,
      "y": 52,
      "seq": [
        "p1",
        "p2",
        "p3"
      ]
    }
  ]
} as DiagramBlock;

export const FIXTURES: Fixture[] = [
  { key: 'F0', label: 'PLAIN · F0 the four actions', block: PLAIN_F0 },
  { key: 'F3', label: 'HEAT · F3 full pitch + CDM attack blobs', block: PITCH_F3, heat: CDM_ATTACK_BLOBS },
  {
    key: 'P1',
    label: 'TAP · P1 back to the keeper (quiz q011)',
    block: TAP_P1,
    prompt: {
  "en": "Our center back has the ball and nothing forward. Tap where the pass goes to open an angle.",
  "es": "Nuestro central tiene el balón y nada adelante. Toca a dónde va el pase para abrir un ángulo."
},
    answer: {
  "en": "back to the keeper",
  "es": "atrás, a la portería"
},
  },
];
