/**
 * Backend language-pair configuration: maps each user-facing pair (defined once
 * in `@workbench/types`) to the provider-specific knobs the cascade needs — STT
 * locale hints, the Deepgram model, and the target TTS voice. Onboarding a new
 * pair is: add it to `LANGUAGE_PAIRS` in the types package, then add a matching
 * entry here. No other code changes (see ADR-002 / README "time-to-onboard").
 */

import {
  LANGUAGE_PAIRS,
  type LanguagePair,
  type LanguagePairCode,
  type TtsVoice,
} from '@workbench/types';
import { env } from './env.js';

export interface LanguagePairProviderConfig {
  readonly pair: LanguagePair;
  /** BCP-47 locale passed to the STT provider for the spoken (source) language. */
  readonly sttLanguage: string;
  /** Deepgram model id for the source language. */
  readonly deepgramModel: string;
  /** Target-language TTS voice. */
  readonly ttsVoice: TtsVoice;
}

function build(code: LanguagePairCode): LanguagePairProviderConfig {
  const pair = LANGUAGE_PAIRS[code];
  return {
    pair,
    sttLanguage: pair.source.bcp47,
    deepgramModel: env.DEEPGRAM_MODEL,
    ttsVoice: pair.ttsVoice,
  };
}

export const languagePairConfigs: Readonly<Record<LanguagePairCode, LanguagePairProviderConfig>> = {
  'en-es': build('en-es'),
  'es-en': build('es-en'),
  'en-fr': build('en-fr'),
  'en-de': build('en-de'),
  'en-pt': build('en-pt'),
  'en-te': build('en-te'),
  'en-hi': build('en-hi'),
};

export function getLanguagePairConfig(code: LanguagePairCode): LanguagePairProviderConfig {
  return languagePairConfigs[code];
}
