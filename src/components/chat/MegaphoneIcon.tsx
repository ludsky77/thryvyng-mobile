import React from 'react';
import Svg, { Path } from 'react-native-svg';

/**
 * The announcements chat's own icon — R-01, Lu 2026-11-04.
 *
 * IT IS NOT AN EMOJI, and that is the whole point of drawing it. The chat list
 * puts an emoji in every other badge (⚽ for a team, 👥 for a group), and an
 * emoji is the OS font's picture: it changes between iOS versions, it carries
 * its own colour, and it cannot be tinted to the row's channel colour. The
 * announcements row is the one chat every family in the club sees, so its
 * badge is drawn here instead and takes `color` from the caller.
 *
 * `react-native-svg` is already a dependency (15.12.1) and already used by the
 * lineup and training boards, so this adds nothing to the install.
 *
 * ONE 24x24 BOX, three strokes: the cone, the grip under it, and one sound arc
 * to its right. Stroke-only, round caps and joins, so it sits beside Feather's
 * line glyphs — which is what the rest of the chat header uses — rather than
 * beside the filled emoji it replaces. `size` is the box; the stroke scales
 * with it so the drawing keeps its weight at any size.
 */
export function MegaphoneIcon({
  size = 20,
  color = '#fff',
}: {
  size?: number;
  color?: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* The cone: narrow at the left, the bell facing right. */}
      <Path
        d="M4 10 L13.5 5 L13.5 17 L4 12 Z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* The grip, hanging off the cone's underside. */}
      <Path
        d="M7 13.6 L7 19.4"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        fill="none"
      />
      {/* One wave of sound. A second arc reads as clutter at 20px. */}
      <Path
        d="M16.8 8.8 A4 4 0 0 1 16.8 13.2"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}

export default MegaphoneIcon;
