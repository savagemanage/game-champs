/**
 * strings.ts - the dependency-free string table for Frosthold: Last Ember's
 * KO/EN i18n.
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
  // Brand (proper noun; the full title where space allows).
  'brand.name': { en: 'FROSTHOLD', ko: '서리성채' },

  // Title scene.
  'title.tagline': { en: 'Keep the Ember burning.', ko: '불씨를 꺼뜨리지 마라' },
  'title.play': { en: 'Enter the Hold', ko: '성채 입장' },
  'title.continue': { en: 'Continue', ko: '이어하기' },
  'title.newGame': { en: 'New Hold', ko: '새 성채' },
  'title.settings': { en: 'Settings', ko: '설정' },
  'title.hint': { en: 'SPACE Play    S Settings', ko: 'SPACE 시작    S 설정' },

  // Common actions.
  'common.back': { en: 'Back', ko: '뒤로' },
  'common.close': { en: 'Close', ko: '닫기' },
  'common.confirm': { en: 'Confirm', ko: '확인' },
  'common.cancel': { en: 'Cancel', ko: '취소' },

  // Resource labels.
  'resource.food': { en: 'Rations', ko: '식량' },
  'resource.wood': { en: 'Timber', ko: '목재' },
  'resource.coal': { en: 'Coal', ko: '석탄' },
  'resource.iron': { en: 'Iron', ko: '철' },
  'resource.steel': { en: 'Steel', ko: '강철' },
  'resource.perSecond': { en: '{amount}/s', ko: '{amount}/초' },

  // Premium currency (Ember Sparks) + survivor population labels.
  'premium.emberSparks': { en: 'Ember Sparks', ko: '불씨 정수' },
  'population.label': { en: 'Survivors', ko: '생존자' },
  'population.value': { en: '{total}/{cap}', ko: '{total}/{cap}' },
  'population.assigned': { en: 'Working {assigned} · Idle {idle}', ko: '작업 {assigned} · 대기 {idle}' },
  'population.satisfaction': { en: 'Morale {pct}%', ko: '사기 {pct}%' },

  // Town scene / HUD.
  'town.title': { en: 'YOUR HOLD', ko: '나의 성채' },
  'town.battle': { en: 'To Battle', ko: '전투로' },
  'town.training': { en: 'War Camp', ko: '전진 기지' },
  'town.settings': { en: 'Settings', ko: '설정' },
  'town.hint': { en: 'Tap a building to upgrade   B Battle   S Settings', ko: '건물을 눌러 업그레이드   B 전투   S 설정' },
  'town.locked': { en: 'Locked', ko: '잠김' },
  'town.saved': { en: 'Saved', ko: '저장됨' },
  'town.onboarding': {
    en: 'The long winter has come. Your buildings gather resources over time. Tap the Furnace to upgrade it and keep the Ember alive, raise a Hunters\u2019 Hut for rations, then train survivors at the War Camp and march To Battle.',
    ko: '기나긴 겨울이 찾아왔습니다. 건물은 시간이 지날수록 자원을 모읍니다. 용광로를 눌러 업그레이드하고 불씨를 지키세요. 사냥꾼 오두막을 올려 식량을 얻은 뒤, 전진 기지에서 생존자를 훈련해 전투로 나아가세요.',
  },
  'town.onboardingDismiss': { en: 'Got it', ko: '알겠어요' },

  // Warmth (the signature frozen-survival mechanic).
  'warmth.label': { en: 'Warmth', ko: '온기' },
  'warmth.value': { en: '{warmth}/{max}', ko: '{warmth}/{max}' },
  'warmth.output': { en: 'Output {pct}%', ko: '생산 효율 {pct}%' },
  'warmth.freezing': { en: 'FREEZING!', ko: '혹한 경고!' },
  'warmth.fuelBurn': { en: 'Fuel: {wood} timber + {coal} coal /s', ko: '연료: 목재 {wood} + 석탄 {coal} /초' },
  'warmth.furnaceInfo': { en: 'Warmth {warmth}/{max}', ko: '온기 {warmth}/{max}' },

  // Building names.
  'building.furnace': { en: 'Furnace', ko: '용광로' },
  'building.hunters_hut': { en: 'Hunters\u2019 Hut', ko: '사냥꾼 오두막' },
  'building.sawmill': { en: 'Sawmill', ko: '벌목장' },
  'building.coal_pit': { en: 'Coal Pit', ko: '탄광' },
  'building.iron_mine': { en: 'Iron Mine', ko: '철광산' },
  'building.war_camp': { en: 'War Camp', ko: '전진 기지' },
  'building.shelter_row': { en: 'Shelter Row', ko: '피난 거처' },
  'building.frost_vault': { en: 'Frost Vault', ko: '서리 금고' },
  'building.forge_hall': { en: 'Forge Hall', ko: '제련장' },
  'building.envoy_hall': { en: 'Envoy Hall', ko: '사절관' },
  'building.warming_ward': { en: 'Warming Ward', ko: '온기 병동' },
  'building.ember_archive': { en: 'Ember Archive', ko: '불씨 서고' },
  'building.infantry_yard': { en: 'Infantry Yard', ko: '보병 연무장' },
  'building.lancer_yard': { en: 'Lancer Yard', ko: '창병 연무장' },
  'building.marksman_range': { en: 'Marksman Range', ko: '사격장' },

  // Building descriptions.
  'building.furnace.desc': {
    en: 'The heart of your hold, where the Ember must never die. Its level caps how far every other building can be upgraded.',
    ko: '성채의 심장부로, 불씨가 결코 꺼져서는 안 된다. 그 레벨이 다른 모든 건물의 업그레이드 한계 레벨을 결정한다.',
  },
  'building.hunters_hut.desc': { en: 'Sends out hunters to bring back rations for your survivors and soldiers.', ko: '사냥꾼을 내보내 생존자와 병사들을 먹일 식량을 구해 온다.' },
  'building.sawmill.desc': { en: 'Fells frozen timber into a steady supply of wood.', ko: '얼어붙은 나무를 벌목해 목재를 꾸준히 공급한다.' },
  'building.coal_pit.desc': { en: 'Digs coal to feed the Furnace and hold back the cold.', ko: '용광로에 넣어 추위를 막을 석탄을 캔다.' },
  'building.iron_mine.desc': { en: 'Mines iron to forge upgrades and arm your soldiers.', ko: '업그레이드와 병력 무장을 위한 철을 채굴한다.' },
  'building.war_camp.desc': { en: 'Trains survivors into soldiers to defend the hold in battle.', ko: '전투에서 성채를 지킬 병사로 생존자를 훈련한다.' },
  'building.shelter_row.desc': { en: 'Warm quarters that house more survivors and raise your population cap.', ko: '더 많은 생존자를 수용해 인구 한계를 올리는 따뜻한 거처.' },
  'building.frost_vault.desc': { en: 'A fortified store that shelters a portion of your resources from raids.', ko: '자원의 일부를 약탈로부터 지켜 주는 견고한 창고.' },
  'building.forge_hall.desc': { en: 'A steelworks that refines iron and coal into sturdy steel.', ko: '철과 석탄을 정련해 튼튼한 강철을 만드는 제련소.' },
  'building.envoy_hall.desc': { en: 'A diplomatic hub for envoys and requests for aid from other holds.', ko: '다른 성채에 사절과 원조 요청을 보내는 외교 거점.' },
  'building.warming_ward.desc': { en: 'A heated infirmary where wounded survivors recover.', ko: '부상당한 생존자가 회복하는 난방 병동.' },
  'building.ember_archive.desc': { en: 'A hall of study where survivors research new advances.', ko: '생존자들이 새로운 기술을 연구하는 학문의 전당.' },
  'building.infantry_yard.desc': { en: 'A drill yard that trains front-line infantry.', ko: '최전선 보병을 훈련하는 연무장.' },
  'building.lancer_yard.desc': { en: 'A drill yard that trains charging lancers.', ko: '돌격 창병을 훈련하는 연무장.' },
  'building.marksman_range.desc': { en: 'A shooting range that trains ranged marksmen.', ko: '원거리 사수를 훈련하는 사격장.' },

  // Building panel UI.
  'building.level': { en: 'Level {level}', ko: '레벨 {level}' },
  'building.maxLevel': { en: 'MAX LEVEL', ko: '최대 레벨' },
  'building.upgrade': { en: 'Upgrade', ko: '업그레이드' },
  'building.upgradeTo': { en: 'Upgrade to Lv.{level}', ko: 'Lv.{level} 업그레이드' },
  'building.upgrading': { en: 'Upgrading… {seconds}s', ko: '업그레이드 중… {seconds}초' },
  'building.output': { en: 'Output: {amount}/s', ko: '생산량: {amount}/초' },
  'building.lockedByFurnace': {
    en: 'Raise the Furnace to Lv.{level} first',
    ko: '먼저 용광로를 Lv.{level}(으)로 올리세요',
  },
  'building.insufficient': { en: 'Not enough resources', ko: '자원이 부족합니다' },

  // Troop names.
  'troop.trapper': { en: 'Trapper', ko: '덫사냥꾼' },
  'troop.marksman': { en: 'Marksman', ko: '사수' },
  'troop.vanguard': { en: 'Vanguard', ko: '선봉대' },

  // Troop descriptions.
  'troop.trapper.desc': { en: 'Cheap, sturdy front-line survivors who snare heavy foes.', ko: '무거운 적을 덫으로 묶는 저렴하고 튼튼한 최전선 생존자.' },
  'troop.marksman.desc': { en: 'Ranged damage from behind the line.', ko: '전열 뒤에서 원거리 피해를 준다.' },
  'troop.vanguard.desc': { en: 'Elite heavy shock troops with high health.', ko: '높은 체력을 지닌 정예 중장 돌격대.' },

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
  'training.noWarCamp': { en: 'Build a War Camp to train soldiers', ko: '병력 훈련하려면 전진 기지를 지으세요' },
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
  'battle.incoming': { en: '{count} Horde incoming', ko: '서리 무리 {count}마리 접근 중' },
  'battle.noTroops': { en: 'Train soldiers before battle', ko: '전투 전에 병력을 훈련하세요' },
  'battle.comingSoon': { en: 'The frozen field awaits…', ko: '얼어붙은 전장이 당신을 기다립니다…' },
  'battle.skip': { en: 'Skip', ko: '건너뛰기' },
  'battle.speed': { en: 'Speed x{mult}', ko: '속도 x{mult}' },
  'battle.armyRemaining': { en: 'Army', ko: '병력' },
  'battle.enemyRemaining': { en: 'Horde', ko: '무리' },
  'battle.clash': { en: 'The Horde strikes!', ko: '서리 무리가 덮쳐옵니다!' },

  // Enemy names (the Frozen Horde).
  'enemy.frost_wolf': { en: 'Frost Wolf', ko: '서리늑대' },
  'enemy.ravager': { en: 'Ravager', ko: '약탈수' },
  'enemy.frost_titan': { en: 'Frost Titan', ko: '서리 거인' },

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
    en: 'While away you gathered {food} rations, {wood} timber, {coal} coal, {iron} iron.',
    ko: '자리를 비운 동안 식량 {food}, 목재 {wood}, 석탄 {coal}, 철 {iron}을(를) 모았습니다.',
  },
  'save.reset': { en: 'Progress reset', ko: '진행이 초기화되었습니다' },

  // Game over / result scene.
  'result.victory': { en: 'VICTORY', ko: '승리' },
  'result.defeat': { en: 'DEFEAT', ko: '패배' },
  'result.fullVictory': { en: 'THE HOLD ENDURES', ko: '성채는 버텨냈다' },
  'result.fullVictoryDesc': {
    en: 'Every wave of the Horde repelled. Your Ember still burns!',
    ko: '서리 무리의 모든 습격을 물리쳤습니다. 불씨는 여전히 타오릅니다!',
  },
  'result.wavesCleared': { en: 'Waves survived: {waves}', ko: '버텨낸 웨이브: {waves}' },
  'result.reward': { en: 'Reward: {iron} iron', ko: '보상: 철 {iron}' },
  'result.rewardLine': { en: '+{food} rations  +{wood} timber  +{coal} coal  +{iron} iron', ko: '+{food} 식량  +{wood} 목재  +{coal} 석탄  +{iron} 철' },
  'result.casualties': { en: 'Casualties: {count}', ko: '전사자: {count}' },
  'result.survivors': { en: 'Survivors: {count}', ko: '생존자: {count}' },
  'result.nextWave': { en: 'Next wave: {wave}', ko: '다음 웨이브: {wave}' },
  'result.defeatDesc': { en: 'Your soldiers fell, but the hold still stands. Regroup and try again.', ko: '병력은 쓰러졌지만 성채는 건재합니다. 전열을 재정비하세요.' },
  'result.retry': { en: 'Retry', ko: '재도전' },
  'result.train': { en: 'Train Troops', ko: '병력 훈련' },
  'result.toTown': { en: 'To Town', ko: '마을로' },
  'result.keyhint': { en: 'R Retry    SPACE Town', ko: 'R 재도전    SPACE 마을' },
  'result.keyhintNoRetry': { en: 'SPACE Town', ko: 'SPACE 마을' },

  // Tooltips.
  'tooltip.cost': { en: 'Cost: {cost}', ko: '비용: {cost}' },
  'tooltip.time': { en: 'Time: {seconds}s', ko: '시간: {seconds}초' },

  // Preload scene.
  'preload.loading': { en: 'Loading {pct}%', ko: '불러오는 중 {pct}%' },
} satisfies Record<string, TrEntry>;

/** The set of valid translation keys, derived from {@link STRINGS}. */
export type TrKey = keyof typeof STRINGS;
