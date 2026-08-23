import { isValidPhoneNumber, parsePhoneNumberFromString, AsYouType } from 'libphonenumber-js';

/**
 * Single source of truth for phone handling (validation, E.164 storage, display).
 * Wraps libphonenumber-js so no surface re-derives its own phone regex.
 *
 * Storage rule: persist E.164 (`+15551234567`) via `toE164`; format only at render
 * time via `formatForDisplay`.
 */

/** Countries we accept phone numbers from, in menu order. */
export type CountryCode = 'US' | 'MX' | 'ES';

export interface SupportedCountry {
  code: CountryCode;
  dialCode: '+1' | '+52' | '+34';
  label: string;
  flag: string;
}

/** Ordered US, MX, ES — drives the country picker. */
export const SUPPORTED_COUNTRIES: SupportedCountry[] = [
  { code: 'US', dialCode: '+1', label: 'United States', flag: '🇺🇸' },
  { code: 'MX', dialCode: '+52', label: 'México', flag: '🇲🇽' },
  { code: 'ES', dialCode: '+34', label: 'España', flag: '🇪🇸' },
];

const SUPPORTED_CODES: CountryCode[] = SUPPORTED_COUNTRIES.map((c) => c.code);

/**
 * True only for a number that is valid in `country`.
 * Empty input returns false — callers decide whether empty is allowed.
 */
export function isValidPhone(input: string, country: CountryCode): boolean {
  const value = input?.trim();
  if (!value) return false;
  try {
    return isValidPhoneNumber(value, country);
  } catch {
    return false;
  }
}

/**
 * Parse to E.164 for storage (`'(555) 123-4567'` + `'US'` -> `'+15551234567'`).
 * Returns null if the input cannot be parsed into a valid number.
 */
export function toE164(input: string, country: CountryCode): string | null {
  const value = input?.trim();
  if (!value) return null;
  try {
    const parsed = parsePhoneNumberFromString(value, country);
    return parsed?.isValid() ? parsed.number : null;
  } catch {
    return null;
  }
}

/**
 * Format for reading: US `(555) 123-4567`, MX `55 1234 5678`, ES `612 34 56 78`.
 * An E.164 string carries its own country, so `country` is only a hint for
 * national-format input. Unparseable input is returned unchanged.
 */
export function formatForDisplay(e164OrInput: string, country?: CountryCode): string {
  const value = e164OrInput?.trim();
  if (!value) return '';
  try {
    // A leading '+' means the country is already encoded in the number itself.
    const parsed = value.startsWith('+')
      ? parsePhoneNumberFromString(value)
      : parsePhoneNumberFromString(value, country);
    return parsed ? parsed.formatNational() : value;
  } catch {
    return value;
  }
}

/**
 * Progressive formatting for a controlled input's onChange — formats the digits
 * typed so far without rejecting a partial number.
 */
export function formatAsYouType(input: string, country: CountryCode): string {
  if (!input) return '';
  try {
    return new AsYouType(country).input(input);
  } catch {
    return input;
  }
}

/**
 * Which supported country an E.164 number belongs to.
 * Returns null if unparseable or outside SUPPORTED_COUNTRIES.
 */
export function detectCountryFromE164(e164: string): CountryCode | null {
  const value = e164?.trim();
  if (!value) return null;
  try {
    const parsed = parsePhoneNumberFromString(value);
    const detected = parsed?.country;
    return detected && SUPPORTED_CODES.includes(detected as CountryCode)
      ? (detected as CountryCode)
      : null;
  } catch {
    return null;
  }
}
