/**
 * strings.ts - the dependency-free string table for Wirework's KO/EN i18n.
 *
 * Every user-facing UI string lives here keyed by a compact string-literal
 * union ({@link TrKey}). Each entry carries both an English (`en`) and a
 * natural Korean (`ko`) rendering. Placeholders use `{name}` syntax and are
 * filled in by {@link tr} from a params record at call time.
 *
 * This module is intentionally pure data + types so it can be imported by both
 * the Phaser scenes and the vitest unit tests with no runtime dependency.
 */

/** Supported UI languages. */
export type Language = 'en' | 'ko';

/** Ordered list of languages the selector cycles through. */
export const LANGUAGES: Language[] = ['en', 'ko'];

/** A single translatable entry: an English and a Korean rendering. */
export interface TrEntry {
  en: string;
  ko: string;
}

/**
 * The full string table. Keys are dotted, grouped by screen/component. The
 * 'WIREWORK' brand is routed through a key too (untranslated proper noun) so
 * no scene hardcodes even the title.
 */
export const STRINGS = {
  // Brand (proper noun; identical in both languages).
  'brand.name': { en: 'WIREWORK', ko: 'WIREWORK' },

  // Title scene.
  'title.tagline': { en: 'Wall-Defense ODM Action', ko: '성벽 방어 입체기동 액션' },
  'title.deploy': { en: 'Deploy', ko: '출격' },
  'title.settings': { en: 'Settings', ko: '설정' },
  'title.hint': { en: 'SPACE Deploy    S Settings', ko: 'SPACE 출격    S 설정' },

  // Settings scene.
  'settings.title': { en: 'SETTINGS', ko: '설정' },
  'settings.master': { en: 'Master', ko: '전체' },
  'settings.sfx': { en: 'SFX', ko: '효과음' },
  'settings.music': { en: 'Music', ko: '음악' },
  'settings.difficulty': { en: 'Difficulty', ko: '난이도' },
  'settings.language': { en: 'Language', ko: '언어' },
  'settings.back': { en: 'Back', ko: '뒤로' },

  // Difficulty values.
  'difficulty.relaxed': { en: 'RELAXED', ko: '여유' },
  'difficulty.standard': { en: 'STANDARD', ko: '표준' },
  'difficulty.brutal': { en: 'BRUTAL', ko: '가혹' },

  // Language values (each shown in its own language).
  'language.en': { en: 'English', ko: 'English' },
  'language.ko': { en: '한국어', ko: '한국어' },

  // Pause scene.
  'pause.title': { en: 'PAUSED', ko: '일시정지' },
  'pause.resume': { en: 'Resume', ko: '계속하기' },
  'pause.settings': { en: 'Settings', ko: '설정' },
  'pause.quit': { en: 'Quit to Title', ko: '타이틀로 나가기' },
  'pause.hint': { en: 'P / ESC to resume', ko: 'P / ESC 로 계속' },

  // Game over scene.
  'gameover.victory': { en: 'CITY HELD', ko: '도시 사수' },
  'gameover.retry': { en: 'Retry', ko: '재도전' },
  'gameover.title': { en: 'Title', ko: '타이틀' },
  'gameover.stats': {
    en: 'SCORE   {score}\nWAVES SURVIVED   {waves}\nCITIZENS SAVED   {saved}',
    ko: '점수   {score}\n생존 웨이브   {waves}\n구출한 시민   {saved}',
  },
  'gameover.keyhint': { en: 'R Retry    SPACE Title', ko: 'R 재도전    SPACE 타이틀' },

  // Lose-reason messages (consumed by FEAT-002).
  'gameover.reason.hero_dead': { en: 'THE HERO HAS FALLEN', ko: '용사가 쓰러졌다' },
  'gameover.reason.inner_breached': { en: 'THE WALL HAS FALLEN', ko: '성벽이 무너졌다' },
  'gameover.reason.citizens_lost': { en: 'THE CITY IS LOST', ko: '도시를 잃었다' },
  'gameover.reason.abandoned': { en: 'YOU ABANDONED THE WALL', ko: '성벽을 버리고 떠났다' },

  // In-game HUD.
  'hud.hp': { en: 'HP', ko: '체력' },
  'hud.gas': { en: 'GAS', ko: '가스' },
  'hud.outer': { en: 'OUTER RING', ko: '외곽 성벽' },
  'hud.inner': { en: 'INNER RING', ko: '내곽 성벽' },
  'hud.hint': {
    en: 'WASD Move   Shift Dash   L-Click Grapple   R-Click Slash   Q/E Reel   P Pause',
    ko: 'WASD 이동   Shift 대시   좌클릭 갈고리   우클릭 베기   Q/E 감기   P 일시정지',
  },
  'hud.wave': { en: 'WAVE {wave} / {total}', ko: '웨이브 {wave} / {total}' },
  'hud.incoming': { en: '{count} INCOMING', ko: '{count} 접근 중' },
  'hud.status': {
    en: 'SCORE {score}\nWAVE {wave}/{total}\nCITIZENS {saved}/{citizensTotal}',
    ko: '점수 {score}\n웨이브 {wave}/{total}\n시민 {saved}/{citizensTotal}',
  },

  // Preload scene.
  'preload.loading': { en: 'Loading {pct}%', ko: '불러오는 중 {pct}%' },
} satisfies Record<string, TrEntry>;

/** The set of valid translation keys, derived from {@link STRINGS}. */
export type TrKey = keyof typeof STRINGS;
