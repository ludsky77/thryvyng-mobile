/**
 * Archivo, loaded for the Playbook and for nothing else.
 *
 * The mobile counterpart of the web's `loadPlaybookFont.ts`
 * (`thrive-and-score` @ `83a3686`), which injects a Google Fonts <link> from
 * the route's own chunk. There is no <link> and no network here: the four
 * `.ttf` files ship inside `@expo-google-fonts/archivo` and are registered
 * with the OS by `expo-font`.
 *
 * WHY THE `useFonts` HOOK AND NOT THE `expo-font` CONFIG PLUGIN. The plugin's
 * `fonts` option copies font files into the native project, so a face only
 * exists once a new native binary is built — nothing would render in Archivo
 * on the dev client now, and every weight change would cost an EAS build. The
 * hook registers the same files at runtime from the JS bundle, which Metro
 * already serves, so the CURRENT dev client renders Archivo on reload.
 * `app.json` does carry a bare `"expo-font"` plugin entry that `expo install`
 * added; with no `fonts` array it configures nothing and is inert.
 *
 * WHY IT IS SCOPED HERE AND NOT IN `App.tsx`. The standing performance ruling
 * is that the Playbook must not slow app open — the same reason the web keeps
 * the <link> out of `index.html`. This module is imported only by
 * `PlaybookScreen`, so the four faces are requested the first time the book is
 * opened and never for the people who never open it. THE LAZY RULE (§ E3)
 * still holds: nothing here is imported from a layout, a tab or a provider.
 *
 * IT DOES NOT FLASH AND IT DOES NOT BLOCK. `useFonts` is local work on files
 * already in the bundle, and `PlaybookScreen` holds its existing "Opening the
 * playbook…" state until this reports back, so no text is ever painted in the
 * system font and then re-painted in Archivo. The rest of the app is never
 * waiting on it, because nothing outside the book mounts this.
 */

import { useFonts } from 'expo-font';
// ONE SUBPATH PER FACE, NOT THE PACKAGE ROOT. `@expo-google-fonts/archivo`'s
// `index.js` is a barrel that `require()`s all 18 faces at module scope, so
// importing four names from it makes Metro bundle the other fourteen too —
// measured: `npx expo export --platform ios` listed all 18 `.ttf`s, 2.2 MB of
// font the design never asks for. Each weight also ships its own entry point
// (`400Regular/index.js`), which pulls exactly one file. Four imports, four
// faces, ~0.5 MB.
import { Archivo_400Regular } from '@expo-google-fonts/archivo/400Regular';
import { Archivo_500Medium } from '@expo-google-fonts/archivo/500Medium';
import { Archivo_700Bold } from '@expo-google-fonts/archivo/700Bold';
import { Archivo_800ExtraBold } from '@expo-google-fonts/archivo/800ExtraBold';
import { fontFamily } from './theme';

/**
 * The map `expo-font` registers: alias → file.
 *
 * The keys MUST be the strings in `theme.ts`'s `fontFamily`, because that is
 * what the styles ask RN for, and RN resolves nothing else. They are read from
 * `fontFamily` rather than retyped so the two cannot drift; `semibold` and
 * `bold` are deliberately the same face (600 → 700, see `theme.ts`), and
 * writing the object this way collapses them to one entry instead of
 * registering the same file twice.
 */
export const PLAYBOOK_FONTS = {
  [fontFamily.regular]: Archivo_400Regular,
  [fontFamily.medium]: Archivo_500Medium,
  [fontFamily.bold]: Archivo_700Bold,
  [fontFamily.extrabold]: Archivo_800ExtraBold,
} as const;

/**
 * True once the book may be painted in Archivo.
 *
 * `useFonts` hands back `[loaded, error]`. Either one ends the wait: a face
 * that cannot be registered is not a reason to leave the reader on a spinner
 * forever, and RN already has the fallback — an unresolved `fontFamily`
 * renders the system font. The cost of that path is that the design's weights
 * go with it (the styles carry no `fontWeight`, by `theme.ts`'s rule), so the
 * book would read flat rather than wrong. The faces are bundled, so this is a
 * belt-and-braces branch, not an expected one.
 *
 * Returns the error too, so a caller can report it rather than guess.
 */
export function usePlaybookFont(): { ready: boolean; error: Error | null } {
  const [loaded, error] = useFonts(PLAYBOOK_FONTS);
  return { ready: loaded || !!error, error: error ?? null };
}
