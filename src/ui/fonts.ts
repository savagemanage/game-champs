import { assetPath } from '../config/AssetKeys';

/**
 * fonts.ts - bundle and load the Korean-capable UI web font.
 *
 * Frosthold: Last Ember is KOREAN-FIRST. Phaser draws all UI text onto a
 * canvas using whatever face the browser resolves from the CSS font stack, so
 * if no Korean-capable font is installed the Hangul renders as tofu (missing
 * glyph boxes). Headless Chromium (used for screenshots/CI) ships NO CJK fonts
 * at all, which would make every screen unreadable.
 *
 * To make rendering deterministic on every browser/OS we bundle a subset of
 * Nanum Gothic Coding (SIL OFL 1.1) - a MONOSPACE Hangul face, so the crisp
 * monospace grid the UI was designed around is preserved while every Korean
 * glyph the game uses is covered. The subset woff2 files are produced by
 * tools/gen_fonts.py and live in public/assets/fonts/.
 *
 * Because the font is loaded via the CSS Font Loading API, callers MUST await
 * {@link ensureFontsLoaded} before Phaser rasterizes any text (see main.ts);
 * otherwise the first frames paint with the fallback font.
 */

/** The font-family name registered for the bundled UI font. */
export const KO_FONT_FAMILY = 'Nanum Gothic Coding';

interface FontFaceSpec {
  weight: string;
  file: string;
}

const FONT_FACES: readonly FontFaceSpec[] = [
  { weight: '400', file: 'assets/fonts/NanumGothicCoding-Regular.subset.woff2' },
  { weight: '700', file: 'assets/fonts/NanumGothicCoding-Bold.subset.woff2' },
];

let loadPromise: Promise<void> | null = null;

/**
 * Register the bundled UI font faces and resolve once they are ready to paint.
 * Idempotent (the work runs once and the same promise is reused) and safe in
 * non-browser environments (resolves immediately when the Font Loading API is
 * unavailable, e.g. the vitest/node test runner).
 */
export function ensureFontsLoaded(): Promise<void> {
  if (loadPromise) return loadPromise;

  if (
    typeof document === 'undefined' ||
    typeof FontFace === 'undefined' ||
    !('fonts' in document)
  ) {
    loadPromise = Promise.resolve();
    return loadPromise;
  }

  loadPromise = Promise.all(
    FONT_FACES.map(async (spec) => {
      const face = new FontFace(KO_FONT_FAMILY, `url(${assetPath(spec.file)}) format('woff2')`, {
        weight: spec.weight,
        style: 'normal',
        display: 'swap',
      });
      const loaded = await face.load();
      (document.fonts as FontFaceSet).add(loaded);
    }),
  )
    .then(() => undefined)
    // Never block boot on a font error; fall back to the system stack instead.
    .catch(() => undefined);

  return loadPromise;
}
