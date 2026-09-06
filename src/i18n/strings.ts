/**
 * strings.ts - the dependency-free string table for LAST SQUAD's KO/EN i18n.
 *
 * Every user-facing UI string lives here keyed by a compact string-literal
 * union ({@link TrKey}). Each entry carries both an English (`en`) and a
 * natural Korean (`ko`) rendering. The game is KOREAN-FIRST: the runtime
 * defaults to 'ko' (see i18n.ts), so the Korean strings are the primary text.
 * Placeholders use `{name}` syntax and are filled in by {@link tr} from a
 * params record at call time.
 *
 * This module is intentionally pure data + types so it can be imported by both
 * the Phaser scenes and the vitest unit tests with no runtime dependency.
 */

/** Supported UI languages. */
export type Language = 'ko' | 'en';

/** Ordered list of languages the selector cycles through (Korean-first). */
export const LANGUAGES: Language[] = ['ko', 'en'];

/** A single translatable entry: an English and a Korean rendering. */
export interface TrEntry {
  en: string;
  ko: string;
}

/**
 * The full string table. Keys are dotted, grouped by screen/component. The
 * brand name is routed through a key too (proper noun) so no scene hardcodes
 * even the title.
 */
export const STRINGS = {
  // Brand (original title).
  'brand.name': { en: 'LAST SQUAD', ko: '라스트 스쿼드' },

  // Title scene.
  'title.tagline': { en: 'Grow the squad. Reach the boss.', ko: '분대를 키워 보스에 도달하라' },
  'title.play': { en: 'Deploy', ko: '출격' },
  'title.howto': { en: 'How to Play', ko: '플레이 방법' },
  'title.upgrades': { en: 'Upgrades', ko: '업그레이드' },
  'title.settings': { en: 'Settings', ko: '설정' },
  'title.hint': { en: 'SPACE Deploy    U Upgrades    S Settings', ko: 'SPACE 출격    U 업그레이드    S 설정' },
  'title.best': { en: 'Best {meters} m', ko: '최고 {meters} m' },
  'title.bestScore': { en: 'Best score {score}', ko: '최고 점수 {score}' },

  // Common actions.
  'common.back': { en: 'Back', ko: '뒤로' },
  'common.close': { en: 'Close', ko: '닫기' },
  'common.confirm': { en: 'Confirm', ko: '확인' },
  'common.cancel': { en: 'Cancel', ko: '취소' },

  // Run HUD.
  'run.squad': { en: 'Squad', ko: '분대' },
  'run.squadSize': { en: 'Squad {count}', ko: '분대 {count}' },
  'run.distance': { en: 'Distance', ko: '거리' },
  'run.distanceValue': { en: '{meters} m', ko: '{meters} m' },
  'run.score': { en: 'Score', ko: '점수' },
  'run.scoreValue': { en: 'Score {score}', ko: '점수 {score}' },
  'run.laneHint': { en: 'Drag or ← → to switch lanes', ko: '드래그 또는 ← → 로 차선 이동' },
  'run.bossWarning': { en: 'BOSS AHEAD', ko: '보스 접근' },
  'run.enemyIncoming': { en: 'Enemies incoming', ko: '적 접근 중' },
  'run.pause': { en: 'Pause', ko: '일시정지' },
  'run.go': { en: 'GO!', ko: '출발!' },
  'run.tapHint': { en: 'Drag / ← → to move', ko: '드래그 / ← → 이동' },

  // Gate operations (labels are rendered numerically in-scene; these describe them).
  'gate.add': { en: 'Add soldiers', ko: '병력 추가' },
  'gate.sub': { en: 'Lose soldiers', ko: '병력 감소' },
  'gate.mul': { en: 'Multiply squad', ko: '분대 증폭' },
  'gate.div': { en: 'Divide squad', ko: '분대 분할' },

  // Results scene.
  'result.victory': { en: 'VICTORY', ko: '승리' },
  'result.victoryDesc': { en: 'The boss is down. The squad holds the line.', ko: '보스를 격파했습니다. 분대가 전선을 지켜냈습니다.' },
  'result.defeat': { en: 'DEFEAT', ko: '패배' },
  'result.defeatDesc': { en: 'The squad was wiped out. Upgrade and redeploy.', ko: '분대가 전멸했습니다. 강화 후 재출격하세요.' },
  'result.distance': { en: 'Distance: {meters} m', ko: '거리: {meters} m' },
  'result.score': { en: 'Score: {score}', ko: '점수: {score}' },
  'result.squadPeak': { en: 'Peak squad: {count}', ko: '최대 분대: {count}' },
  'result.best': { en: 'Best: {meters} m', ko: '최고 기록: {meters} m' },
  'result.bestScore': { en: 'Best score: {score}', ko: '최고 점수: {score}' },
  'result.coinsEarned': { en: '+{coins} coins', ko: '코인 +{coins}' },
  'result.newBest': { en: 'NEW BEST!', ko: '신기록!' },
  'result.upgrades': { en: 'Upgrades', ko: '업그레이드' },
  'result.retry': { en: 'Redeploy', ko: '재출격' },
  'result.title': { en: 'Main Menu', ko: '메인 메뉴' },
  'result.keyhint': { en: 'R Redeploy    U Upgrades    SPACE Menu', ko: 'R 재출격    U 업그레이드    SPACE 메뉴' },

  // Upgrade / meta screen.
  'upgrade.title': { en: 'UPGRADES', ko: '업그레이드' },
  'upgrade.coins': { en: 'Coins: {coins}', ko: '코인: {coins}' },
  'upgrade.level': { en: 'Lv. {level}', ko: 'Lv. {level}' },
  'upgrade.levelOf': { en: 'Lv. {level} / {max}', ko: 'Lv. {level} / {max}' },
  'upgrade.cost': { en: 'Cost {cost}', ko: '비용 {cost}' },
  'upgrade.max': { en: 'MAX', ko: '최대' },
  'upgrade.buy': { en: 'Upgrade', ko: '강화' },
  'upgrade.insufficient': { en: 'Not enough coins', ko: '코인이 부족합니다' },
  'upgrade.deploy': { en: 'Deploy', ko: '출격' },
  'upgrade.back': { en: 'Back', ko: '뒤로' },

  // Upgrade names + descriptions.
  'upgrade.start_size': { en: 'Starting Squad', ko: '시작 분대' },
  'upgrade.start_size.desc': { en: 'Deploy with more soldiers each run.', ko: '매 출격마다 더 많은 병력으로 시작합니다.' },
  'upgrade.damage': { en: 'Firepower', ko: '화력' },
  'upgrade.damage.desc': { en: 'Each soldier deals more damage per shot.', ko: '각 병사의 사격 피해가 증가합니다.' },
  'upgrade.fire_rate': { en: 'Fire Rate', ko: '연사 속도' },
  'upgrade.fire_rate.desc': { en: 'Each soldier fires faster.', ko: '각 병사의 사격 속도가 빨라집니다.' },
  'upgrade.coin_bonus': { en: 'Salvage', ko: '보급 회수' },
  'upgrade.coin_bonus.desc': { en: 'Earn more coins from every run.', ko: '모든 출격에서 더 많은 코인을 획득합니다.' },

  // Settings scene.
  'settings.title': { en: 'SETTINGS', ko: '설정' },
  'settings.master': { en: 'Master', ko: '전체' },
  'settings.sfx': { en: 'SFX', ko: '효과음' },
  'settings.music': { en: 'Music', ko: '음악' },
  'settings.language': { en: 'Language', ko: '언어' },
  'settings.reset': { en: 'Reset Progress', ko: '진행 초기화' },
  'settings.resetConfirm': { en: 'Erase all progress and coins?', ko: '모든 진행과 코인을 지울까요?' },
  'settings.reset.done': { en: 'Progress reset', ko: '진행이 초기화되었습니다' },
  'settings.back': { en: 'Back', ko: '뒤로' },

  // Language values (each shown in its own language).
  'language.en': { en: 'English', ko: 'English' },
  'language.ko': { en: '한국어', ko: '한국어' },

  // How-to-play instructions.
  'howto.title': { en: 'HOW TO PLAY', ko: '플레이 방법' },
  'howto.move': { en: 'Drag left/right or use ← → to switch between the two lanes.', ko: '드래그하거나 ← → 키로 두 차선 사이를 이동하세요.' },
  'howto.gates': { en: 'Run through green gates to grow your squad; avoid the red ones.', ko: '초록 게이트를 통과해 분대를 키우고, 빨간 게이트는 피하세요.' },
  'howto.autofire': { en: 'Your soldiers auto-fire at enemy clusters. A bigger squad shoots harder.', ko: '병사들은 적 무리를 자동으로 사격합니다. 분대가 클수록 화력이 강해집니다.' },
  'howto.boss': { en: 'Survive to the end and defeat the boss to win the run.', ko: '끝까지 살아남아 보스를 물리치면 승리합니다.' },
  'howto.meta': { en: 'Spend earned coins on upgrades between runs.', ko: '출격 사이에 획득한 코인으로 업그레이드하세요.' },

  // Save / load feedback.
  'save.saved': { en: 'Saved', ko: '저장됨' },
  'save.loaded': { en: 'Progress loaded', ko: '진행 불러옴' },

  // Preload scene.
  'preload.loading': { en: 'Loading {pct}%', ko: '불러오는 중 {pct}%' },
} satisfies Record<string, TrEntry>;

/** The set of valid translation keys, derived from {@link STRINGS}. */
export type TrKey = keyof typeof STRINGS;
