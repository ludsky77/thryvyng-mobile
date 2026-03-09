/**
 * Returns the localized value based on language preference.
 * Uses Spanish (_es) when language is 'es' and the Spanish value exists.
 */
export function getLocalizedContent<T>(
  enValue: T,
  esValue: T | null | undefined,
  language: 'en' | 'es'
): T {
  if (language !== 'es') return enValue;
  if (esValue == null || esValue === '') return enValue;
  if (Array.isArray(esValue) && esValue.length === 0) return enValue;
  if (typeof esValue === 'object' && Object.keys(esValue).length === 0) return enValue;
  return esValue;
}
