export interface SupportedLanguage {
  code: string;
  label: string;
  flag: string;
}

// Provisional until the backend/provider publishes the supported-language endpoint.
export const supportedLanguages: SupportedLanguage[] = [
  { code: 'en', label: 'English', flag: 'EN' },
  { code: 'si', label: 'Sinhala', flag: 'SI' },
  { code: 'ta', label: 'Tamil', flag: 'TA' },
  { code: 'es', label: 'Spanish', flag: 'ES' },
  { code: 'fr', label: 'French', flag: 'FR' },
  { code: 'de', label: 'German', flag: 'DE' },
  { code: 'ja', label: 'Japanese', flag: 'JA' },
];

export function languageLabel(code: string): string {
  return supportedLanguages.find((language) => language.code === code)?.label ?? code.toUpperCase();
}

