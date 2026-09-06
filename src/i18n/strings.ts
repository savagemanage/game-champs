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

  // Base economy - resource names (original, genre-appropriate).
  'resource.rations': { en: 'Rations', ko: '식량' },
  'resource.steel': { en: 'Steel', ko: '철강' },
  'resource.fuel': { en: 'Fuel', ko: '연료' },
  'resource.circuitry': { en: 'Circuitry', ko: '전자부품' },

  // Base buildings - names.
  'building.hq': { en: 'Headquarters', ko: '본부' },
  'building.tech_center': { en: 'Tech Center', ko: '테크센터' },
  'building.parade_ground': { en: 'Parade Ground', ko: '연병장' },
  'building.hospital': { en: 'Hospital', ko: '병원' },
  'building.barracks': { en: 'Barracks', ko: '병영' },
  'building.drone_center': { en: 'Drone Center', ko: '드론센터' },

  // Base buildings - descriptions.
  'building.hq.desc': {
    en: 'Command center. Its level caps every other building and boosts all resource production and storage.',
    ko: '지휘 본부. 다른 모든 건물의 최대 레벨을 결정하며 자원 생산과 저장량을 늘립니다.',
  },
  'building.tech_center.desc': {
    en: 'Researches upgrades and produces circuitry for advanced construction.',
    ko: '업그레이드를 연구하고 고급 건설에 필요한 전자부품을 생산합니다.',
  },
  'building.parade_ground.desc': {
    en: 'Musters the squad and boosts rations and fuel production.',
    ko: '분대를 집결시키고 식량과 연료 생산을 늘립니다.',
  },
  'building.hospital.desc': {
    en: 'Treats wounded soldiers, raising heal capacity between battles.',
    ko: '부상병을 치료하여 전투 사이의 회복 용량을 늘립니다.',
  },
  'building.barracks.desc': {
    en: 'Trains new troops and produces steel for the war effort.',
    ko: '새 병력을 훈련시키고 철강을 생산합니다.',
  },
  'building.drone_center.desc': {
    en: 'Fields support drones and produces fuel for the rescue squad.',
    ko: '지원 드론을 운용하고 구조대를 위한 연료를 생산합니다.',
  },

  // Base management (construction feedback).
  'building.upgrade': { en: 'Upgrade', ko: '업그레이드' },
  'building.level': { en: 'Lv. {level}', ko: 'Lv. {level}' },
  'building.building': { en: 'Building… {seconds}s', ko: '건설 중… {seconds}초' },
  'building.complete': { en: 'Construction complete', ko: '건설 완료' },
  'building.hqCapped': { en: 'Upgrade HQ first', ko: '먼저 본부를 올리세요' },
  'building.queueFull': { en: 'Another building is under construction', ko: '다른 건물을 건설 중입니다' },
  'building.maxLevel': { en: 'Max level', ko: '최대 레벨' },
  'building.insufficient': { en: 'Not enough resources', ko: '자원이 부족합니다' },

  // Hero combat types (type triangle: tank > missile > aircraft > tank).
  'herotype.tank': { en: 'Armor', ko: '기갑' },
  'herotype.missile': { en: 'Missile', ko: '미사일' },
  'herotype.aircraft': { en: 'Aircraft', ko: '항공' },

  // Hero roles.
  'herorole.dealer': { en: 'Dealer', ko: '딜러' },
  'herorole.tank': { en: 'Tank', ko: '탱커' },
  'herorole.support': { en: 'Support', ko: '서포터' },

  // Hero grades.
  'herograde.UR': { en: 'UR', ko: 'UR' },
  'herograde.SSR': { en: 'SSR', ko: 'SSR' },
  'herograde.SR': { en: 'SR', ko: 'SR' },

  // Hero names + one-line lore (all ORIGINAL; no third-party names/quotes).
  'hero.ironward.name': { en: 'Ironward', ko: '아이언워드' },
  'hero.ironward.lore': { en: 'A living wall who never yields a meter.', ko: '단 한 발짝도 물러서지 않는 살아있는 방벽.' },
  'hero.granitehold.name': { en: 'Granitehold', ko: '그래닛홀드' },
  'hero.granitehold.lore': { en: 'Dug in like bedrock, immovable under fire.', ko: '기반암처럼 버티는, 포화 속에서도 흔들리지 않는 방어수.' },
  'hero.breachram.name': { en: 'Breachram', ko: '브리치램' },
  'hero.breachram.lore': { en: 'Smashes through the line before it can form.', ko: '전열이 갖춰지기 전에 뚫고 들어가는 돌격병.' },
  'hero.aegismend.name': { en: 'Aegismend', ko: '이지스멘드' },
  'hero.aegismend.lore': { en: 'Patches armor mid-battle and holds the shield wall.', ko: '전투 중에도 장갑을 수리하며 방패벽을 유지한다.' },
  'hero.boulwark.name': { en: 'Boulwark', ko: '볼워크' },
  'hero.boulwark.lore': { en: 'Trades finesse for a devastating overhand blow.', ko: '기교를 버리고 파괴적인 내려찍기를 택한 근접 전사.' },
  'hero.stormvolley.name': { en: 'Stormvolley', ko: '스톰볼리' },
  'hero.stormvolley.lore': { en: 'Blankets a sector in guided fire on command.', ko: '명령 한 번에 유도 화력으로 구역을 뒤덮는다.' },
  'hero.arcsalvo.name': { en: 'Arcsalvo', ko: '아크살보' },
  'hero.arcsalvo.lore': { en: 'Ripple-fires arcing rockets over any cover.', ko: '어떤 엄폐물도 넘어가는 곡사 로켓을 연속 발사한다.' },
  'hero.flakscreen.name': { en: 'Flakscreen', ko: '플락스크린' },
  'hero.flakscreen.lore': { en: 'Throws up a curtain of steel to shield allies.', ko: '강철 탄막의 장막으로 아군을 보호한다.' },
  'hero.relayping.name': { en: 'Relayping', ko: '릴레이핑' },
  'hero.relayping.lore': { en: 'Routes medevac calls faster than the enemy can react.', ko: '적이 반응하기 전에 구호 요청을 중계한다.' },
  'hero.sparkrocket.name': { en: 'Sparkrocket', ko: '스파크로켓' },
  'hero.sparkrocket.lore': { en: 'Keeps the squad stocked with rockets and morale.', ko: '분대에 로켓과 사기를 끊임없이 보급한다.' },
  'hero.skytalon.name': { en: 'Skytalon', ko: '스카이탈론' },
  'hero.skytalon.lore': { en: 'Falls out of the sun before anyone hears the engines.', ko: '엔진 소리가 들리기도 전에 태양을 등지고 급강하한다.' },
  'hero.gustrunner.name': { en: 'Gustrunner', ko: '거스트러너' },
  'hero.gustrunner.lore': { en: 'Skims the deck, strafing anything that moves.', ko: '지표면을 스치듯 날며 움직이는 모든 것을 소사한다.' },
  'hero.bastionwing.name': { en: 'Bastionwing', ko: '배스천윙' },
  'hero.bastionwing.lore': { en: 'A hovering fortress that anchors the airspace.', ko: '공역을 장악하는 부양형 요새.' },
  'hero.medevac.name': { en: 'Medevac', ko: '메드백' },
  'hero.medevac.lore': { en: 'Lifts the wounded out and drops supplies back in.', ko: '부상자를 실어 나르고 보급품을 다시 투하한다.' },
  'hero.zephyrguard.name': { en: 'Zephyrguard', ko: '제피르가드' },
  'hero.zephyrguard.lore': { en: 'Rides the tailwind to shore up a failing flank.', ko: '순풍을 타고 무너지는 측면을 보강한다.' },

  // Hero skill names + descriptions (all ORIGINAL).
  'skill.bulwark.name': { en: 'Bulwark', ko: '방벽' },
  'skill.bulwark.desc': { en: 'Raises the squad\'s defense for the fight.', ko: '전투 동안 분대의 방어력을 높인다.' },
  'skill.anchor.name': { en: 'Anchor', ko: '앵커' },
  'skill.anchor.desc': { en: 'Holds position and absorbs extra damage.', ko: '위치를 사수하며 추가 피해를 흡수한다.' },
  'skill.plating.name': { en: 'Reactive Plating', ko: '반응장갑' },
  'skill.plating.desc': { en: 'Reduces incoming damage each round.', ko: '매 라운드 받는 피해를 줄인다.' },
  'skill.overrun.name': { en: 'Overrun', ko: '오버런' },
  'skill.overrun.desc': { en: 'Charges the front line for heavy damage.', ko: '전열을 향해 돌격해 큰 피해를 준다.' },
  'skill.reinforce.name': { en: 'Reinforce', ko: '보강' },
  'skill.reinforce.desc': { en: 'Restores armor to the most damaged ally.', ko: '가장 손상된 아군의 장갑을 회복시킨다.' },
  'skill.smash.name': { en: 'Overhand Smash', ko: '내려찍기' },
  'skill.smash.desc': { en: 'A crushing blow to a single target.', ko: '단일 대상에게 강력한 일격을 가한다.' },
  'skill.saturation.name': { en: 'Saturation Strike', ko: '포화 사격' },
  'skill.saturation.desc': { en: 'Rains missiles for burst damage.', ko: '미사일 세례로 폭발적인 피해를 준다.' },
  'skill.lockon.name': { en: 'Lock-On', ko: '락온' },
  'skill.lockon.desc': { en: 'Improves accuracy against the weakest foe.', ko: '가장 약한 적에 대한 명중을 강화한다.' },
  'skill.barrage.name': { en: 'Barrage', ko: '탄막' },
  'skill.barrage.desc': { en: 'A sustained volley of arcing rockets.', ko: '곡사 로켓을 지속적으로 퍼붓는다.' },
  'skill.flakwall.name': { en: 'Flak Wall', ko: '탄막 장벽' },
  'skill.flakwall.desc': { en: 'Screens allies from incoming fire.', ko: '아군을 적 화력으로부터 가려준다.' },
  'skill.triage.name': { en: 'Triage', ko: '응급 분류' },
  'skill.triage.desc': { en: 'Prioritizes healing for the most wounded ally.', ko: '가장 부상이 심한 아군을 우선 치료한다.' },
  'skill.resupply.name': { en: 'Resupply', ko: '재보급' },
  'skill.resupply.desc': { en: 'Tops up an ally between volleys.', ko: '사격 사이에 아군을 재정비시킨다.' },
  'skill.divebomb.name': { en: 'Dive Bomb', ko: '급강하 폭격' },
  'skill.divebomb.desc': { en: 'Plunges in for critical burst damage.', ko: '급강하로 치명적인 폭발 피해를 준다.' },
  'skill.afterburn.name': { en: 'Afterburn', ko: '애프터버너' },
  'skill.afterburn.desc': { en: 'Boosts speed for extra strikes.', ko: '속도를 높여 추가 타격을 노린다.' },
  'skill.strafe.name': { en: 'Strafing Run', ko: '기총 소사' },
  'skill.strafe.desc': { en: 'Rakes the front line at low altitude.', ko: '저공으로 전열을 훑어 사격한다.' },
  'skill.hover.name': { en: 'Hover Guard', ko: '부양 방어' },
  'skill.hover.desc': { en: 'Holds airspace and shields the squad.', ko: '공역을 유지하며 분대를 보호한다.' },
  'skill.airlift.name': { en: 'Airlift', ko: '공수 후송' },
  'skill.airlift.desc': { en: 'Evacuates and heals the lowest-HP ally.', ko: '체력이 가장 낮은 아군을 후송해 치료한다.' },
  'skill.beacon.name': { en: 'Support Beacon', ko: '지원 신호' },
  'skill.beacon.desc': { en: 'Marks a drop zone that mends the squad.', ko: '분대를 회복시키는 투하 지점을 표시한다.' },
  'skill.tailwind.name': { en: 'Tailwind', ko: '순풍' },
  'skill.tailwind.desc': { en: 'Speeds allies to reinforce a flank.', ko: '아군을 가속해 측면을 보강한다.' },

  // Recruit / gacha UI.
  'recruit.title': { en: 'RECRUIT', ko: '모집' },
  'recruit.pull': { en: 'Recruit', ko: '모집하기' },
  'recruit.pity': { en: 'Guaranteed UR in {count}', ko: '{count}회 내 UR 확정' },
  'recruit.pityHit': { en: 'Pity guarantee!', ko: '천장 확정!' },
  'recruit.new': { en: 'New hero!', ko: '새 영웅!' },
  'recruit.duplicate': { en: 'Duplicate — +{shards} shards', ko: '중복 — 파편 +{shards}' },
  'recruit.shards': { en: 'Shards: {shards}', ko: '파편: {shards}' },

  // Hero / formation UI.
  'hero.level': { en: 'Lv. {level}', ko: 'Lv. {level}' },
  'hero.stars': { en: '{stars}★', ko: '{stars}★' },
  'hero.skillLevel': { en: 'Skill Lv. {level}', ko: '스킬 Lv. {level}' },
  'hero.levelUp': { en: 'Level Up', ko: '레벨 업' },
  'hero.starUp': { en: 'Promote', ko: '승급' },
  'hero.skillUp': { en: 'Train Skill', ko: '스킬 훈련' },
  'hero.stat.hp': { en: 'HP', ko: '체력' },
  'hero.stat.atk': { en: 'ATK', ko: '공격력' },
  'hero.stat.def': { en: 'DEF', ko: '방어력' },
  'hero.stat.speed': { en: 'SPD', ko: '속도' },
  'formation.title': { en: 'FORMATION', ko: '편성' },
  'formation.front': { en: 'Front Row', ko: '전열' },
  'formation.back': { en: 'Back Row', ko: '후열' },
  'formation.empty': { en: 'Empty', ko: '빈 자리' },
  'formation.sameTypeBuff': { en: 'Same-type squad: +20% HP/ATK/DEF', ko: '동일 타입 분대: 체력/공격력/방어력 +20%' },
  'formation.duplicate': { en: 'Hero already placed', ko: '이미 배치된 영웅입니다' },
  'formation.needFive': { en: 'Place 5 heroes', ko: '영웅 5명을 배치하세요' },

  // Battle log verbs (timeline replay in FEAT-007).
  'battle.attack': { en: '{attacker} hits {target} for {damage}', ko: '{attacker}이(가) {target}에게 {damage} 피해' },
  'battle.heal': { en: '{healer} heals {target} for {amount}', ko: '{healer}이(가) {target}을(를) {amount} 회복' },
  'battle.death': { en: '{unit} is down', ko: '{unit} 격추' },
  'battle.advantage': { en: 'Type advantage!', ko: '상성 우위!' },
  'battle.victory': { en: 'Squad prevails', ko: '분대 승리' },
  'battle.defeat': { en: 'Squad wiped out', ko: '분대 전멸' },

  // Save / load feedback.
  'save.saved': { en: 'Saved', ko: '저장됨' },
  'save.loaded': { en: 'Progress loaded', ko: '진행 불러옴' },

  // Preload scene.
  'preload.loading': { en: 'Loading {pct}%', ko: '불러오는 중 {pct}%' },
} satisfies Record<string, TrEntry>;

/** The set of valid translation keys, derived from {@link STRINGS}. */
export type TrKey = keyof typeof STRINGS;
