import { Alert, Linking, Platform } from 'react-native';

/**
 * Open an address in the platform's maps app.
 *
 * WHY THIS WAS REWRITTEN (C3b). Tapping a venue opened nothing on iOS, with no
 * error. Two faults compounded:
 *
 *  1. The iOS branch gated on `canOpenURL('comgooglemaps://?q=…')`. iOS only
 *     answers that probe for schemes declared in `LSApplicationQueriesSchemes`,
 *     and app.json declares none -- so the probe could never succeed, and on
 *     RN/iOS an undeclared scheme can make it *reject* rather than resolve
 *     false.
 *  2. Nothing anywhere caught that. This function had no try/catch, and every
 *     call site invokes it bare -- `onPress={() => openInMaps(...)}` -- so a
 *     rejection became an unhandled promise rejection and the tap did nothing
 *     at all. The Apple Maps fallback on the `else` branch was never reached.
 *
 * The fix removes the probe from the happy path. Apple Maps is always present
 * on iOS, so it is simply the default; Android gets the `geo:` intent. Each
 * candidate is attempted inside its own try/catch, so one failure falls through
 * to the next instead of aborting the chain, and exhausting every candidate
 * surfaces an alert rather than failing silently. This function never rejects.
 *
 * No `LSApplicationQueriesSchemes` entry was added: nothing probes a custom
 * scheme any more, so the config would be dead weight. If a Google-Maps-first
 * preference is ever wanted back on iOS, that entry becomes a prerequisite.
 */
export const openInMaps = async (address: string, locationName?: string) => {
  const raw = address || locationName || '';
  const query = encodeURIComponent(raw);

  if (!query) return;

  const webUrl = `https://www.google.com/maps/search/?api=1&query=${query}`;

  // Ordered most- to least-preferred. The last entry is a plain https URL, so
  // it opens in a browser on any device that has one.
  const candidates =
    Platform.OS === 'ios'
      ? [`http://maps.apple.com/?q=${query}`, webUrl]
      : [`geo:0,0?q=${query}`, webUrl];

  for (const url of candidates) {
    try {
      await Linking.openURL(url);
      return;
    } catch (err) {
      if (__DEV__) {
        console.warn('[maps] openURL failed, trying next:', url, err);
      }
    }
  }

  // Every candidate refused. Say so -- the old code's silence is what made this
  // bug invisible for so long.
  Alert.alert('Could not open Maps', raw);
};
