/**
 * strings.ts - the dependency-free string table for Kingdom Rise's KO/EN i18n.
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
 * brand name is routed through a key too (proper noun; identical in both
 * languages) so no scene hardcodes even the title.
 */
export const STRINGS = {
  // Brand (proper noun; identical in both languages).
  'brand.name': { en: 'KINGDOM RISE', ko: '킹덤 라이즈' },

  // Title scene.
  'title.tagline': { en: 'Build. Grow. Defend.', ko: '건설하고, 성장하고, 방어하라' },
  'title.play': { en: 'Enter Kingdom', ko: '왕국 입장' },
  'title.continue': { en: 'Continue', ko: '이어하기' },
  'title.newGame': { en: 'New Kingdom', ko: '새 왕국' },
  'title.settings': { en: 'Settings', ko: '설정' },
  'title.hint': { en: 'SPACE Play    S Settings', ko: 'SPACE 시작    S 설정' },

  // Common actions.
  'common.back': { en: 'Back', ko: '뒤로' },
  'common.close': { en: 'Close', ko: '닫기' },
  'common.confirm': { en: 'Confirm', ko: '확인' },
  'common.cancel': { en: 'Cancel', ko: '취소' },

  // Resource labels.
  'resource.food': { en: 'Food', ko: '식량' },
  'resource.wood': { en: 'Wood', ko: '목재' },
  'resource.stone': { en: 'Stone', ko: '석재' },
  'resource.gold': { en: 'Gold', ko: '금화' },
  'resource.perSecond': { en: '{amount}/s', ko: '{amount}/초' },

  // Town scene / HUD.
  'town.title': { en: 'YOUR KINGDOM', ko: '나의 왕국' },
  'town.battle': { en: 'To Battle', ko: '전투로' },
  'town.training': { en: 'Barracks', ko: '병영' },
  'town.settings': { en: 'Settings', ko: '설정' },
  'town.hint': { en: 'Tap a building to upgrade   B Battle   S Settings', ko: '건물을 눌러 업그레이드   B 전투   S 설정' },
  'town.locked': { en: 'Locked', ko: '잠김' },
  'town.saved': { en: 'Saved', ko: '저장됨' },
  'town.onboarding': {
    en: 'Welcome! Your buildings gather resources over time. Tap the Town Center to upgrade it, raise a Farm for food, then train troops at the Barracks and march To Battle.',
    ko: '환영합니다! 건물은 시간이 지날수록 자원을 모읍니다. 중앙 청사를 눌러 업그레이드하고, 농장을 올려 식량을 얻은 뒤, 병영에서 병력을 훈련해 전투로 나아가세요.',
  },
  'town.onboardingDismiss': { en: 'Got it', ko: '알겠어요' },

  // Building names.
  'building.town_center': { en: 'Town Center', ko: '중앙 청사' },
  'building.farm': { en: 'Farm', ko: '농장' },
  'building.lumber_mill': { en: 'Lumber Mill', ko: '제재소' },
  'building.quarry': { en: 'Quarry', ko: '채석장' },
  'building.mine': { en: 'Mine', ko: '광산' },
  'building.barracks': { en: 'Barracks', ko: '병영' },

  // Building descriptions.
  'building.town_center.desc': {
    en: 'The heart of your kingdom. Its level caps how far every other building can be upgraded.',
    ko: '왕국의 심장부. 다른 모든 건물의 업그레이드 한계 레벨을 결정한다.',
  },
  'building.farm.desc': { en: 'Produces food to feed your growing population and army.', ko: '늘어나는 인구와 군대를 먹일 식량을 생산한다.' },
  'building.lumber_mill.desc': { en: 'Fells timber into a steady supply of wood.', ko: '목재를 꾸준히 공급하도록 나무를 벌목한다.' },
  'building.quarry.desc': { en: 'Cuts stone for sturdier structures.', ko: '더 튼튼한 건물을 위한 석재를 캔다.' },
  'building.mine.desc': { en: 'Digs up gold to fund upgrades and troops.', ko: '업그레이드와 병력 자금을 위한 금화를 채굴한다.' },
  'building.barracks.desc': { en: 'Trains troops to defend the kingdom in battle.', ko: '전투에서 왕국을 지킬 병력을 훈련한다.' },

  // Building panel UI.
  'building.level': { en: 'Level {level}', ko: '레벨 {level}' },
  'building.maxLevel': { en: 'MAX LEVEL', ko: '최대 레벨' },
  'building.upgrade': { en: 'Upgrade', ko: '업그레이드' },
  'building.upgradeTo': { en: 'Upgrade to Lv.{level}', ko: 'Lv.{level} 업그레이드' },
  'building.upgrading': { en: 'Upgrading… {seconds}s', ko: '업그레이드 중… {seconds}초' },
  'building.output': { en: 'Output: {amount}/s', ko: '생산량: {amount}/초' },
  'building.lockedByTownCenter': {
    en: 'Raise the Town Center to Lv.{level} first',
    ko: '먼저 중앙 청사를 Lv.{level}(으)로 올리세요',
  },
  'building.insufficient': { en: 'Not enough resources', ko: '자원이 부족합니다' },

  // Troop names.
  'troop.spearman': { en: 'Spearman', ko: '창병' },
  'troop.archer': { en: 'Archer', ko: '궁병' },
  'troop.knight': { en: 'Knight', ko: '기사' },

  // Troop descriptions.
  'troop.spearman.desc': { en: 'Cheap, sturdy front-line infantry.', ko: '저렴하고 튼튼한 최전선 보병.' },
  'troop.archer.desc': { en: 'Ranged damage from behind the line.', ko: '전열 뒤에서 원거리 피해를 준다.' },
  'troop.knight.desc': { en: 'Elite heavy cavalry with high health.', ko: '높은 체력을 지닌 정예 중기병.' },

  // Training UI.
  'training.title': { en: 'TRAINING', ko: '병력 훈련' },
  'training.queue': { en: 'Queue', ko: '대기열' },
  'training.train': { en: 'Train', ko: '훈련' },
  'training.trainCount': { en: 'Train {count}', ko: '{count}명 훈련' },
  'training.inProgress': { en: 'Training {count} {troop}… {seconds}s', ko: '{troop} {count}명 훈련 중… {seconds}초' },
  'training.queueFull': { en: 'Training queue is full', ko: '훈련 대기열이 가득 찼습니다' },
  'training.army': { en: 'Army: {count}', ko: '병력: {count}' },
  'training.standing': { en: 'Standing Army', ko: '보유 병력' },
  'training.queueEmpty': { en: 'No troops in training', ko: '훈련 중인 병력 없음' },
  'training.queueItem': { en: '{count} {troop} — {seconds}s', ko: '{troop} {count}명 — {seconds}초' },
  'training.noBarracks': { en: 'Build a Barracks to train troops', ko: '병력 훈련하려면 병영을 지으세요' },
  'training.cost': { en: 'Cost {cost}', ko: '비용 {cost}' },
  'training.time': { en: '{seconds}s each', ko: '개당 {seconds}초' },

  // Combat / battle UI.
  'battle.title': { en: 'BATTLE', ko: '전투' },
  'battle.prepare': { en: 'Prepare! Wave in {seconds}s', ko: '준비! {seconds}초 후 웨이브' },
  'battle.wave': { en: 'WAVE {wave} / {total}', ko: '웨이브 {wave} / {total}' },
  'battle.deploy': { en: 'Deploy Troops', ko: '병력 배치' },
  'battle.start': { en: 'Start Battle', ko: '전투 시작' },
  'battle.retreat': { en: 'Retreat', ko: '후퇴' },
  'battle.gateHp': { en: 'Gate {hp}/{max}', ko: '성문 {hp}/{max}' },
  'battle.incoming': { en: '{count} raiders incoming', ko: '침략자 {count}명 접근 중' },
  'battle.noTroops': { en: 'Train troops before battle', ko: '전투 전에 병력을 훈련하세요' },
  'battle.comingSoon': { en: 'The battlefield awaits…', ko: '전장이 당신을 기다립니다…' },
  'battle.skip': { en: 'Skip', ko: '건너뛰기' },
  'battle.speed': { en: 'Speed x{mult}', ko: '속도 x{mult}' },
  'battle.armyRemaining': { en: 'Army', ko: '병력' },
  'battle.enemyRemaining': { en: 'Raiders', ko: '침략자' },
  'battle.clash': { en: 'The armies clash!', ko: '양군이 충돌합니다!' },

  // Enemy names.
  'enemy.raider': { en: 'Raider', ko: '침략자' },
  'enemy.brute': { en: 'Brute', ko: '광전사' },
  'enemy.ram': { en: 'Battering Ram', ko: '공성 망치' },

  // Settings scene.
  'settings.title': { en: 'SETTINGS', ko: '설정' },
  'settings.master': { en: 'Master', ko: '전체' },
  'settings.sfx': { en: 'SFX', ko: '효과음' },
  'settings.music': { en: 'Music', ko: '음악' },
  'settings.language': { en: 'Language', ko: '언어' },
  'settings.reset': { en: 'Reset Progress', ko: '진행 초기화' },
  'settings.resetConfirm': { en: 'Erase all progress?', ko: '모든 진행을 지울까요?' },
  'settings.back': { en: 'Back', ko: '뒤로' },

  // Language values (each shown in its own language).
  'language.en': { en: 'English', ko: 'English' },
  'language.ko': { en: '한국어', ko: '한국어' },

  // Pause scene.
  'pause.title': { en: 'PAUSED', ko: '일시정지' },
  'pause.resume': { en: 'Resume', ko: '계속하기' },
  'pause.settings': { en: 'Settings', ko: '설정' },
  'pause.quit': { en: 'Quit to Town', ko: '마을로 나가기' },
  'pause.hint': { en: 'P / ESC to resume', ko: 'P / ESC 로 계속' },

  // Save / load feedback.
  'save.saved': { en: 'Saved', ko: '저장됨' },
  'save.loaded': { en: 'Progress loaded', ko: '진행 불러옴' },
  'save.offlineGains': {
    en: 'While away you gathered {food} food, {wood} wood, {stone} stone, {gold} gold.',
    ko: '자리를 비운 동안 식량 {food}, 목재 {wood}, 석재 {stone}, 금화 {gold}를 모았습니다.',
  },
  'save.reset': { en: 'Progress reset', ko: '진행이 초기화되었습니다' },

  // Game over / result scene.
  'result.victory': { en: 'VICTORY', ko: '승리' },
  'result.defeat': { en: 'DEFEAT', ko: '패배' },
  'result.fullVictory': { en: 'KINGDOM TRIUMPHANT', ko: '왕국의 승리' },
  'result.fullVictoryDesc': {
    en: 'Every wave repelled. Your kingdom stands unbroken!',
    ko: '모든 웨이브를 물리쳤습니다. 왕국은 무너지지 않았습니다!',
  },
  'result.wavesCleared': { en: 'Waves cleared: {waves}', ko: '격파한 웨이브: {waves}' },
  'result.reward': { en: 'Reward: {gold} gold', ko: '보상: 금화 {gold}' },
  'result.rewardLine': { en: '+{food} food  +{wood} wood  +{stone} stone  +{gold} gold', ko: '+{food} 식량  +{wood} 목재  +{stone} 석재  +{gold} 금화' },
  'result.casualties': { en: 'Casualties: {count}', ko: '전사자: {count}' },
  'result.survivors': { en: 'Survivors: {count}', ko: '생존자: {count}' },
  'result.nextWave': { en: 'Next wave: {wave}', ko: '다음 웨이브: {wave}' },
  'result.defeatDesc': { en: 'Your army fell, but the town still stands. Regroup and try again.', ko: '병력은 쓰러졌지만 마을은 건재합니다. 전열을 재정비하세요.' },
  'result.retry': { en: 'Retry', ko: '재도전' },
  'result.toTown': { en: 'To Town', ko: '마을로' },
  'result.keyhint': { en: 'R Retry    SPACE Town', ko: 'R 재도전    SPACE 마을' },

  // Tooltips.
  'tooltip.cost': { en: 'Cost: {cost}', ko: '비용: {cost}' },
  'tooltip.time': { en: 'Time: {seconds}s', ko: '시간: {seconds}초' },

  // Preload scene.
  'preload.loading': { en: 'Loading {pct}%', ko: '불러오는 중 {pct}%' },
} satisfies Record<string, TrEntry>;

/** The set of valid translation keys, derived from {@link STRINGS}. */
export type TrKey = keyof typeof STRINGS;
