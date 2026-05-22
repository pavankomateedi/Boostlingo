/**
 * Language and language-pair definitions.
 *
 * This is the single source of truth for the user-facing language pairs the
 * workbench supports. The frontend renders the language selector from
 * {@link LANGUAGE_PAIRS}; the backend maps each pair to provider-specific model
 * configuration in `packages/backend/src/config/languagePairs.ts`. Adding a pair
 * here plus a backend config entry is the entire "time-to-onboard a new language
 * pair" surface the assignment asks about.
 */

/** ISO 639-1 language codes the workbench knows about. */
export type LanguageCode = 'en' | 'es' | 'fr' | 'de' | 'pt' | 'te';

/** OpenAI TTS voice identifiers. */
export type TtsVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';

export interface Language {
  /** ISO 639-1 code. */
  readonly code: LanguageCode;
  /** Human-readable name shown in the UI. */
  readonly name: string;
  /** BCP-47 locale used as a hint to STT/TTS providers (e.g. `en-US`). */
  readonly bcp47: string;
}

/** Directed source->target pair codes. */
export type LanguagePairCode = 'en-es' | 'es-en' | 'en-fr' | 'en-de' | 'en-pt' | 'en-te';

export interface LanguagePair {
  readonly code: LanguagePairCode;
  readonly source: Language;
  readonly target: Language;
  /** Default TTS voice for the target language. */
  readonly ttsVoice: TtsVoice;
}

const EN: Language = { code: 'en', name: 'English', bcp47: 'en-US' };
const ES: Language = { code: 'es', name: 'Spanish', bcp47: 'es-ES' };
const FR: Language = { code: 'fr', name: 'French', bcp47: 'fr-FR' };
const DE: Language = { code: 'de', name: 'German', bcp47: 'de-DE' };
const PT: Language = { code: 'pt', name: 'Portuguese', bcp47: 'pt-BR' };
const TE: Language = { code: 'te', name: 'Telugu', bcp47: 'te-IN' };

export const LANGUAGE_PAIRS: Readonly<Record<LanguagePairCode, LanguagePair>> = {
  'en-es': { code: 'en-es', source: EN, target: ES, ttsVoice: 'alloy' },
  'es-en': { code: 'es-en', source: ES, target: EN, ttsVoice: 'alloy' },
  'en-fr': { code: 'en-fr', source: EN, target: FR, ttsVoice: 'nova' },
  'en-de': { code: 'en-de', source: EN, target: DE, ttsVoice: 'onyx' },
  'en-pt': { code: 'en-pt', source: EN, target: PT, ttsVoice: 'shimmer' },
  'en-te': { code: 'en-te', source: EN, target: TE, ttsVoice: 'fable' },
};

export const LANGUAGE_PAIR_CODES = Object.keys(LANGUAGE_PAIRS) as LanguagePairCode[];

/** Type guard validating an untrusted string is a known language-pair code. */
export function isLanguagePairCode(value: string): value is LanguagePairCode {
  return Object.prototype.hasOwnProperty.call(LANGUAGE_PAIRS, value);
}
