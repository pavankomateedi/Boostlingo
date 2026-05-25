/**
 * Drops transcription hallucinations in the wrong script. The workbench's source
 * languages (en/es/fr/de) are all Latin-script, but Whisper-family transcription
 * models invent phantom phrases in other scripts (Japanese, Chinese, Devanagari,
 * Cyrillic, …) on silence, breaths, and background noise. Any such text is never
 * genuine speech in a Latin-script source language, so callers drop it.
 */

/** Source-language codes that use the Latin alphabet. */
const LATIN_SOURCES = new Set(['en', 'es', 'fr', 'de']);

// Hiragana/Katakana, CJK, Hangul, all Indic scripts (Devanagari..Malayalam:
// incl. Telugu/Tamil/Kannada), Cyrillic, Hebrew, Arabic, Thai.
const NON_LATIN_SCRIPT =
  // eslint-disable-next-line no-misleading-character-class -- intentional BMP script ranges
  /[぀-ヿ㐀-鿿가-힯ऀ-ൿЀ-ӿ֐-׿؀-ۿ฀-๿]/;

/**
 * True when `text` contains characters from a script the source language would
 * never use — i.e. a transcription hallucination to be discarded.
 */
export function isForeignScript(text: string, sourceCode: string): boolean {
  if (!LATIN_SOURCES.has(sourceCode)) return false;
  return NON_LATIN_SCRIPT.test(text);
}
