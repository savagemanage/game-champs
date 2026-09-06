<a id="korean"></a>

**[한국어](#korean) · [English](#english)**

# 킹덤 라이즈 (Kingdom Rise)

오리지널 세계관의 2D 픽셀아트 **중세 전략 / 방치형** 브라우저 게임입니다. 작은
정착지를 키워 나가세요. 자원 건물이 시간이 지날수록 **식량·목재·석재·금화**를
자동으로 생산하고, 중앙의 **중앙 청사(Town Center)** 레벨이 다른 모든 건물의
업그레이드 한계를 결정합니다. 병력은 병영에서 시간이 걸리는 **훈련 대기열**로
양성하며, 주기적으로 몰려오는 **침략자 웨이브**를 애니메이션으로 연출되는
결정론적 전투로 막아내야 합니다. 다섯 병종(**창병·궁병·기사·기병·공성 병기**)이
가위바위보식 상성 고리를 이루고, **연구소(연구·기술 트리)**로 경제와 군대를
영구 강화하며, **영웅**을 영입해 출전시키면 전투력이나 생산량 보너스를 얻고,
**성벽·감시탑** 방어 건물이 마을 방어력을 더해 줍니다. **임무(퀘스트)** 체인이
초반 진행을 안내하고 자원·영웅 조각 보상을 지급합니다. 진행 상황은
`localStorage`에 저장되며, 자리를 비운 동안의 방치 수익도 다시 접속할 때
정산됩니다. UI는 **한국어 우선**이며 영어도 지원합니다.

> **오리지널 창작물 / IP 경계.** 킹덤 라이즈는 기지 건설 / 방치형 왕국 장르에서
> *영감을 받은* **오리지널** 게임입니다. 모든 이름, 세계관, 아트, 오디오는 이
> 프로젝트의 순수 창작물입니다. "Kingshot"(또는 그 밖의 어떤 제3자) 이름,
> 캐릭터, 세력, 스토리, 스프라이트도 사용하지 않습니다. 전체 에셋 출처는
> [`assets/CREDITS.md`](assets/CREDITS.md)를 참고하세요.
>
> 워크스페이스 슬러그와 GitHub Pages 경로(`packages/kingshot`,
> `savagemanage.github.io/open-games/kingshot/`)는 이 프로젝트가 오마주하는 장르를
> 나타내는 **배포 식별자**일 뿐, 게임 브랜드의 일부가 아닙니다. 빌드에 담긴 그
> 무엇도(게임 내 제목 "Kingdom Rise / 킹덤 라이즈", 세계관, 병종·적 이름, 아트,
> 오디오) 제3자 IP를 사용하지 않습니다. 슬러그는 고정된 배포 대상이며 의도적으로
> 그대로 둡니다.

**라이브 빌드 플레이:** <https://savagemanage.github.io/open-games/kingshot/>

## 기술 스택

- [Phaser 3](https://phaser.io/) — 2D 게임 프레임워크 (아케이드 물리, WebAudio)
- [TypeScript](https://www.typescriptlang.org/) — strict 모드, 타입이 지정된 소스
- [Vite](https://vitejs.dev/) — 개발 서버 + 프로덕션 번들링
- [Vitest](https://vitest.dev/) — 순수 로직 시스템에 대한 유닛 테스트
- 모든 에셋은 [`tools/`](tools/)의 Python 스크립트가 생성한 오리지널 창작물
  (픽셀아트는 Pillow, SFX/음악은 표준 라이브러리 합성)

논리 해상도는 선명한 **960×540** 픽셀 캔버스로, 최근접 이웃(nearest-neighbour)
렌더링으로 창 크기에 맞춰 확대됩니다.

## 시작하기

**Node 22 이상**이 필요합니다 (GitHub Pages 배포 워크플로가 빌드에 사용하는
버전과 동일합니다. [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml)
참고).

킹덤 라이즈는 [open-games](../../README.md) 모노레포의 워크스페이스입니다.
의존성은 이 디렉터리가 아니라 **저장소 루트**에서 한 번만 설치합니다.

```bash
npm install       # 저장소 루트에서 실행; 모든 워크스페이스를 설치
```

이후 패키지 스크립트는 여기서 실행하거나, 루트에서 `-w packages/kingshot`을
붙여 실행합니다.

```bash
npm run dev       # Vite 개발 서버 시작 (핫 리로드)
npm run build     # 타입 체크 + dist/로 프로덕션 빌드
npm run preview   # 프로덕션 빌드를 로컬에서 미리보기
npm run typecheck # 타입 체크만 실행 (tsc --noEmit)
npm run test      # vitest 유닛 테스트 실행
```

Vite가 출력하는 개발 서버 주소(기본값 <http://localhost:5173>)를 열어 주세요.

## 플레이 방법

게임 전체를 마우스만으로 플레이할 수 있으며, 일부 키보드 단축키가 화면의 버튼을
대체합니다.

| 입력                 | 동작                                                          |
| -------------------- | ------------------------------------------------------------- |
| **건물 클릭**        | 업그레이드 패널 열기 (레벨, 다음 비용/시간, 업그레이드)        |
| **병영 / 병영 버튼** | 병력 훈련 패널 열기                                           |
| `R`                  | **연구** 패널 열기 (마을에서)                                 |
| `H`                  | **영웅** 패널 열기 (마을에서)                                 |
| `Q`                  | **임무** 패널 열기 (마을에서)                                 |
| `B`                  | **전투로** 진군 (마을에서)                                    |
| `S`                  | **설정** 열기 (타이틀 또는 마을에서)                          |
| `L`                  | 언어 전환 (타이틀 화면의 언어 토글과 동일)                    |
| `Esc`                | 열린 패널 닫기 / 전투 애니메이션 건너뛰기                     |
| `Space`              | 플레이/이어하기 (타이틀) · **마을로** 복귀 (게임 오버)        |
| `R`                  | 전투 **재도전** (게임 오버)                                   |

### 핵심 루프

1. **수집 (방치).** 농장·제재소·채석장·광산이 시간이 지날수록 식량·목재·석재·
   금화를 생산합니다. 탭을 닫아 두어도 마찬가지이며, 자리를 비운 시간은 다시
   접속할 때 (상한과 배율이 적용되어) 정산되고 무엇을 모았는지 요약이 표시됩니다.
2. **업그레이드.** 모든 건물은 기하급수적으로 늘어나는 비용과 건설 타이머를 두고
   업그레이드됩니다. **중앙 청사** 레벨이 다른 모든 건물의 레벨 상한을 정하므로,
   진행의 중추가 됩니다.
3. **훈련.** 병영에서 **창병·궁병·기사·기병·공성 병기** 다섯 병종을 묶음 단위로
   대기열에 넣으면, 각 묶음이 훈련 시간이 지난 뒤 완성되어 보유 병력에 합류합니다.
   병종은 소프트 가위바위보 상성 고리를 이루어, 조합에 따라 전투 결과가 실제로
   달라집니다.
4. **연구·영웅·방어.** **연구소(연구소 건물)**에서 군사·경제 기술 트리를 연구해
   공격력·생산량·훈련 속도 등을 영구 강화합니다. **영웅**을 영입·레벨업·승급하고
   한 명을 출전시키면 역할(전쟁/경제)에 따라 전투력 또는 생산량 보너스를 받습니다.
   **성벽·감시탑**을 지으면 마을 방어력이 올라 침략에 더 잘 버티고 패배 피해도
   줄어듭니다. **임무** 패널의 진행 체인을 완료하면 자원과 영웅 조각을 받습니다.
5. **전투.** 병력을 전투로 보내 점점 강해지는 침략자 웨이브(**침략자·광전사·공성
   망치·기습병**)를 막아냅니다. 결과는 전투 시스템이 연구·영웅·마을 방어력 보너스를
   합산해 결정론적으로 계산한 뒤 애니메이션으로 연출됩니다. 승리하면 자원 보상을
   얻고 웨이브 진행이 올라가며, 패배하면 병력은 잃지만 마을은 건재합니다. 전투
   HUD의 **건너뛰기**와 **속도**로 진행 속도를 조절할 수 있습니다.
6. **더 어렵게, 반복.** 웨이브를 하나 격파할 때마다 다음 웨이브의 난이도가
   올라갑니다. 마지막으로 설정된 웨이브를 격파하면 전체 캠페인 승리입니다.

**설정**에서는 전체 / 효과음 / 음악 볼륨 슬라이더와 언어 토글(한국어 / English)을
제공하며 모두 `localStorage`에 저장됩니다. 또한 두 번 눌러 확인하는 **진행
초기화** 옵션으로 저장을 지우고 새 왕국을 시작할 수 있습니다.

> **언어 설정 (한국어 / English).** 게임은 **한국어 우선**입니다. 저장된 설정이
> 없는 첫 실행에서는 브라우저 언어와 무관하게 항상 **한국어**로 시작하며,
> 직접 언어를 바꾸기 전까지 한국어를 유지합니다. 한 번이라도 언어를 직접 고르면
> 그 선택이 저장되어 이후 항상 우선합니다(영어를 골랐다면 다음 실행에도 영어).
> 언어는 **타이틀 화면 우측 상단의 토글**(◀ 한국어 ▶)이나 **설정** 화면에서
> 언제든 바꿀 수 있으며, 모든 라벨이 즉시 전환됩니다.

## 저장 / 지속성

게임은 15초 주기와 주요 행동(업그레이드, 전투, 탭 이탈) 시점에 `localStorage`로
자동 저장됩니다. 저장 데이터에는 **버전**이 있어, 손상·부재·구버전 저장은
충돌하지 않고 새 게임으로 안전하게 되돌아갑니다. 자리를 비운 동안 쌓인 방치
생산량은 로드 시 정산됩니다(최대 오프라인 시간 상한과 오프라인 효율 배율 적용).

## 프로젝트 구조

```
src/
  main.ts          Phaser.Game 부트스트랩 + 씬 목록
  config/          설정 기반 튜닝 값 (Game/Building/Troop/Wave) + 에셋/씬 키
  scenes/          Boot, Preload, Title, Town, Battle, GameOver, Settings
  entities/        Battler (애니메이션되는 단일 전투 유닛)
  systems/         순수 로직 시스템: ResourceStore, BuildingSystem, TrainingQueue,
                   CombatSystem, CasualtyTimeline, ResearchSystem, HeroSystem, QuestSystem,
                   SaveManager, GameState + AudioManager, SettingsStore
  ui/              공용 픽셀 UI 헬퍼: Menu, TrainingPanel, ResearchPanel, HeroPanel,
                   QuestPanel, BattleHud, UiText
  types/           공용 횡단 타입
  i18n/            한국어 우선 KO/EN 문자열 테이블 + 소형 런타임
public/assets/     오리지널 스프라이트, 배경, UI, FX, 오디오
tools/             에셋 생성기 (gen_sprites.py, gen_audio.py)
```

`systems/`의 클래스에는 **Phaser 의존성이 없어서**, 자원 계산, 업그레이드 비용
공식, 훈련 대기열 타이밍, 전투 계산, 저장 직렬화, 그리고 설정 로드(한국어 우선
기본값과 저장된 언어 우선 규칙 포함)가 모두 빠른 `vitest`
유닛 테스트(`src/**/*.test.ts`)로 검증됩니다.

## 에셋 재생성

모든 아트와 오디오는 [`tools/`](tools/)의 Python 스크립트가 만든 오리지널
창작물입니다. 재생성하려면:

```bash
python3 -m pip install --user Pillow   # 스프라이트 생성기의 유일한 의존성
python3 tools/gen_sprites.py           # -> public/assets/{sprites,backgrounds,ui,fx}
python3 tools/gen_audio.py             # -> public/assets/audio  (표준 라이브러리만 사용)
```

생성된 에셋은 저장소에 커밋되어 있습니다(Phaser가 런타임에 `public/assets/`에서
로드). 출력은 결정론적이므로 재생성해도 바이트 단위로 동일한 파일이 나옵니다.
전체 파일별 출처는 [`assets/CREDITS.md`](assets/CREDITS.md)에 있습니다.

## 배포 (GitHub Pages)

킹덤 라이즈는 [open-games](../../README.md) 모노레포의 일부로
<https://savagemanage.github.io/open-games/kingshot/> 에 게시됩니다.

배포는 저장소 전체를 한 번에 처리하는
[`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml)이 담당합니다.
`main`에 푸시할 때마다 모든 워크스페이스를 빌드하고, 각 `dist/`를 자기 서브패스로
수집하고, 루트 랜딩 페이지를 생성해 함께 게시합니다. 게임마다 따로 설정할 것은
없습니다. 게임 쪽에서 관여하는 것은 [`vite.config.ts`](vite.config.ts)의 프로덕션
base 경로(`/open-games/kingshot/`)뿐입니다.

## 크레딧

모든 아트와 오디오는 이 프로젝트의 오리지널 창작물이며 [`tools/`](tools/)의
스크립트로 생성됩니다. 전체 파일별 출처와 라이선스는
[`assets/CREDITS.md`](assets/CREDITS.md)에 기록되어 있습니다.

## 라이선스

Apache-2.0. 저장소 루트의 [LICENSE](../../LICENSE)를 참고하세요.

---

<a id="english"></a>

**[한국어](#korean) · [English](#english)**

# Kingdom Rise (킹덤 라이즈)

An original-world 2D pixel-art **medieval strategy / idle** browser game. Grow a
small settlement: resource buildings passively generate **food, wood, stone, and
gold**; a central **Town Center** gates how far every other building can be
upgraded; troops are trained in time-based **queues** at the Barracks; and
periodic **waves of raiders** must be repelled in an animated, deterministic
battle. Five troop types (**Spearman, Archer, Knight, Cavalry, Siege Engine**)
form a rock-paper-scissors counter cycle; a **Scholars' Hall (research / tech
tree)** permanently strengthens your economy and army; recruitable **Heroes**
grant a combat or production bonus when set active; and **Ramparts and
Watchtowers** add town defense. A chain of **Quests** guides early progression
and pays out resources and hero shards. Progress is saved to `localStorage`,
with idle gains credited while you are away. The UI is **Korean-first** (한국어),
with English available.

> **Language settings (한국어 / English).** The game is **Korean-first**. On a
> brand-new run with no saved settings it always starts in **Korean**,
> regardless of the browser locale, and stays Korean until you explicitly change
> the language. Once you pick a language it is persisted and always wins on
> later loads (choose English and the next run is English). Switch languages any
> time via the **toggle at the top-right of the Title screen** (◀ 한국어 ▶) or in
> **Settings**; every label updates instantly.

> **Original work / IP boundary.** Kingdom Rise is an **original** game
> *inspired by* the base-building / idle-kingdom genre. All names, lore, art, and
> audio are original to this project. It does **not** use "Kingshot" (or any
> other third-party) names, characters, factions, story, or sprites. See
> [`assets/CREDITS.md`](assets/CREDITS.md) for full asset provenance.
>
> The workspace slug and GitHub Pages path (`packages/kingshot`,
> `savagemanage.github.io/open-games/kingshot/`) are only a **deployment identifier**
> describing the genre this project is a homage to; they are not part of the
> game's brand. Nothing shipped in the build (the in-game title "Kingdom Rise /
> 킹덤 라이즈", the lore, the troop/enemy names, the art, and the audio) uses any
> third-party IP. The slug is a fixed deployment target and is intentionally
> left unchanged.

**Play the live build:** <https://savagemanage.github.io/open-games/kingshot/>

## Tech stack

- [Phaser 3](https://phaser.io/) — 2D game framework (arcade physics, WebAudio)
- [TypeScript](https://www.typescriptlang.org/) — strict, typed source
- [Vite](https://vitejs.dev/) — dev server + production bundling
- [Vitest](https://vitest.dev/) — unit tests for the pure-logic systems
- Original assets generated by Python scripts in [`tools/`](tools/) (Pillow for
  pixel art, stdlib synthesis for SFX/music)

Logical resolution is a crisp **960×540** pixel canvas scaled to fit the window
with nearest-neighbour rendering.

## Getting started

Requires **Node 22+** (the version the GitHub Pages deploy workflow builds
with; see [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml)).

Kingdom Rise is a workspace of the [open-games](../../README.md) monorepo, so
dependencies are installed once from the **repo root**, not from this
directory:

```bash
npm install       # from the repo root; installs every workspace
```

Then run the package scripts from here (or from the root with
`-w packages/kingshot`):

```bash
npm run dev       # start the Vite dev server (hot reload)
npm run build     # type-check + production build into dist/
npm run preview   # preview the production build locally
npm run typecheck # type-check only (tsc --noEmit)
npm run test      # run the vitest unit suite
```

Open the dev server URL that Vite prints (default <http://localhost:5173>).

## How to play

The whole game is playable with the mouse; a few keyboard shortcuts mirror the
on-screen buttons.

| Input                | Action                                                        |
| -------------------- | ------------------------------------------------------------- |
| **Click a building** | Open its upgrade panel (level, next cost/time, Upgrade)       |
| **Click Barracks / Barracks button** | Open the troop training panel               |
| `R`                  | Open the **Research** panel (from the Town)                   |
| `H`                  | Open the **Heroes** panel (from the Town)                     |
| `Q`                  | Open the **Quests** panel (from the Town)                     |
| `B`                  | March **To Battle** (from the Town)                           |
| `S`                  | Open **Settings** (from the Title or Town)                    |
| `Esc`                | Close the open panel / skip the battle animation              |
| `Space`              | Play/Continue (Title) · return **To Town** (Game Over)        |
| `R`                  | **Retry** the battle (Game Over)                              |

### The core loop

1. **Gather (idle).** The Farm, Lumber Mill, Quarry, and Mine generate food,
   wood, stone, and gold over time — even while the tab is closed. Offline time
   is credited (capped and scaled) the next time you load, with a summary of
   what you gathered.
2. **Upgrade.** Every building upgrades for a geometrically growing cost and a
   build timer. The **Town Center** level caps the level of every other
   building, so it is the backbone of your progression.
3. **Train.** Queue batches of all five troop types (**Spearman, Archer, Knight,
   Cavalry, Siege Engine**) at the Barracks; each batch completes after its
   training time and joins your standing army. The types form a soft
   rock-paper-scissors counter cycle, so composition genuinely changes battle
   outcomes.
4. **Research, Heroes, Defenses.** Research the military and economic tech tree
   at the **Scholars' Hall** to permanently boost attack, production, training
   speed, and more. Recruit, level, and star up **Heroes** and set one active
   for a role-based (war/economy) combat or production bonus. Build **Ramparts
   and Watchtowers** to raise town defense, which helps you hold raids and
   softens losses. Complete the **Quests** chain for resource and hero-shard
   rewards.
5. **Battle.** Send your army To Battle to repel escalating waves of raiders
   (**Raider, Brute, Battering Ram, Rider**). The outcome is resolved
   deterministically by the combat system — composing your research, active
   hero, and town-defense bonuses — and then animated; on a win you earn
   resource rewards and advance your wave progress, on a loss your army is lost
   but the town stands. Use **Skip** and **Speed** in the battle HUD to control
   pacing.
6. **Repeat, harder.** Each cleared wave raises the difficulty of the next.
   Clearing the final configured wave is a full-campaign victory.

**Settings** offers master / SFX / music volume sliders and a language toggle
(한국어 / English), all persisted to `localStorage`, plus a two-press
**Reset Progress** option that wipes the save and starts a fresh kingdom.

## Persistence

The game auto-saves to `localStorage` on a 15-second cadence and on meaningful
actions (upgrades, battles, leaving the tab). The save is **versioned**: a
corrupt, absent, or old-version save falls back to a fresh game rather than
crashing. Idle production accrued while you were away is reconciled on load
(capped at a maximum offline window and scaled by an offline-efficiency factor).

## Project structure

```
src/
  main.ts          Phaser.Game bootstrap + scene list
  config/          Centralized, config-driven tuning (Game/Building/Troop/Wave) + asset/scene keys
  scenes/          Boot, Preload, Title, Town, Battle, GameOver, Settings
  entities/        Battler (a single animated combat unit)
  systems/         Pure-logic systems: ResourceStore, BuildingSystem, TrainingQueue,
                   CombatSystem, CasualtyTimeline, ResearchSystem, HeroSystem, QuestSystem,
                   SaveManager, GameState + AudioManager, SettingsStore
  ui/              Shared pixel-UI helpers: Menu, TrainingPanel, ResearchPanel, HeroPanel,
                   QuestPanel, BattleHud, UiText
  types/           Shared cross-cutting types
  i18n/            Korean-first KO/EN string table + tiny runtime
public/assets/     Original sprites, backgrounds, UI, FX, and audio
tools/             Asset generators (gen_sprites.py, gen_audio.py)
```

The `systems/` classes contain **no Phaser dependency**, so the resource math,
upgrade-cost formulas, training-queue timing, combat resolution, save
serialization, and settings loading (the Korean-first default and the
saved-language-wins rule) are all covered by fast `vitest` unit tests
(`src/**/*.test.ts`).

## Regenerating assets

All art and audio are original and produced by the Python scripts in
[`tools/`](tools/). To regenerate them:

```bash
python3 -m pip install --user Pillow   # only dependency, for the sprite generator
python3 tools/gen_sprites.py           # -> public/assets/{sprites,backgrounds,ui,fx}
python3 tools/gen_audio.py             # -> public/assets/audio  (stdlib only)
```

The generated assets are committed (Phaser loads them at runtime from
`public/assets/`). Output is deterministic, so regenerating produces byte-stable
files. Full per-file provenance is in [`assets/CREDITS.md`](assets/CREDITS.md).

## Deployment (GitHub Pages)

Kingdom Rise is published as part of the [open-games](../../README.md) monorepo,
at <https://savagemanage.github.io/open-games/kingshot/>.

Deployment is handled once for the whole repo by
[`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml): every push
to `main` builds every workspace, collects each `dist/` into its own subpath,
generates the root landing page, and publishes them together. There is nothing
to configure per game - the production base path in
[`vite.config.ts`](vite.config.ts) (`/open-games/kingshot/`) is the only
game-side piece.

## Credits

All art and audio are original to this project and generated by the scripts in
[`tools/`](tools/). Full per-file provenance and licensing is recorded in
[`assets/CREDITS.md`](assets/CREDITS.md).

## License

Apache-2.0, under the repo-root [LICENSE](../../LICENSE).
