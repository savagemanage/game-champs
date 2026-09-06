<a id="korean"></a>

**[한국어](#korean) · [English](#english)**

# 서리성채: 마지막 불씨 (Frosthold: Last Ember)

오리지널 세계관의 2D 픽셀아트 **혹한 생존 도시 건설 / 방치형** 브라우저
게임입니다. 세계는 끝나지 않는 겨울에 잠겼고, 정착지는 중앙의 **화로(Furnace)**
하나에 의지해 버팁니다. 화로의 **불씨(Ember)**에 **목재와 석탄**을 태워 추위를
막아야 하며, 연료가 떨어지면 온기가 식으면서 생산이 둔화됩니다. 자원 건물은
시간이 지날수록 **식량·목재·석탄·철**을 자동으로 생산하고, 중앙의
**화로(Furnace)** 레벨이 다른 모든 건물의 업그레이드 한계를 결정합니다. 병력은
**전투 캠프(War Camp)**에서 시간이 걸리는 **훈련 대기열**로 양성하며, 주기적으로
몰려오는 **서리 군단(Frozen Horde)** 웨이브를 애니메이션으로 연출되는 결정론적
전투로 막아내야 합니다. 진행 상황은 `localStorage`에 저장되며, 자리를 비운 동안의
방치 수익도 다시 접속할 때 정산됩니다. UI는 **한국어 우선**이며 영어도
지원합니다.

> **오리지널 창작물 / IP 경계.** 서리성채: 마지막 불씨는 혹한 생존 도시 건설
> 장르에서 *영감을 받은* **오리지널** 게임입니다. 모든 이름, 세계관, 아트,
> 오디오는 이 프로젝트의 순수 창작물입니다. "Whiteout Survival"(또는 그 밖의 어떤
> 제3자) 이름, 캐릭터, 세력, 스토리, 로고, 스프라이트, 오디오도 사용하지
> 않습니다. 전체 에셋 출처는 [`assets/CREDITS.md`](assets/CREDITS.md)를
> 참고하세요.
>
> 저장소 슬러그와 GitHub Pages 경로(`game-whiteout`,
> `savagemanage.github.io/game-whiteout`)는 고정된 **배포 식별자**일 뿐, 게임
> 브랜드의 일부가 아닙니다. 빌드에 담긴 그 무엇도(게임 내 제목 "Frosthold: Last
> Ember / 서리성채: 마지막 불씨", 세계관, 병종·적 이름, 아트, 오디오) 제3자 IP를
> 사용하지 않습니다. 슬러그는 고정된 배포 대상이며 의도적으로 그대로 둡니다.

**라이브 빌드 플레이:** <https://savagemanage.github.io/game-whiteout/>

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
버전과 동일합니다. [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)
참고).

```bash
npm install       # 의존성 설치
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
| **전투 캠프 / 캠프 버튼** | 병력 훈련 패널 열기                                       |
| `B`                  | **전투로** 진군 (마을에서)                                    |
| `S`                  | **설정** 열기 (타이틀 또는 마을에서)                          |
| `L`                  | 언어 전환 (타이틀 화면의 언어 토글과 동일)                    |
| `Esc`                | 열린 패널 닫기 / 전투 애니메이션 건너뛰기                     |
| `Space`              | 플레이/이어하기 (타이틀) · **마을로** 복귀 (게임 오버)        |
| `R`                  | 전투 **재도전** (게임 오버)                                   |

### 핵심 루프

1. **수집 (방치).** 사냥꾼 오두막·제재소·석탄 채굴장·철광이 시간이 지날수록
   식량·목재·석탄·철을 생산합니다. 탭을 닫아 두어도 마찬가지이며, 자리를 비운
   시간은 다시 접속할 때 (상한과 배율이 적용되어) 정산되고 무엇을 모았는지 요약이
   표시됩니다.
2. **온기 유지 (화로).** **화로**는 매 초 **목재와 석탄**을 태워 온기(Warmth)를
   유지합니다. 연료가 있으면 온기가 최대치로 차오르고, 연료가 바닥나면 온기가
   식으면서 방치 생산이 하한선까지 둔화됩니다. 화로 레벨을 올리면 최대 온기가
   커지고 연료 효율도 좋아지므로, 불씨에 투자한 만큼 두 배로 보답받습니다.
3. **업그레이드.** 모든 건물은 기하급수적으로 늘어나는 비용과 건설 타이머를 두고
   업그레이드됩니다. **화로** 레벨이 다른 모든 건물의 레벨 상한을 정하므로, 진행의
   중추가 됩니다.
4. **훈련.** 전투 캠프에서 **덫사냥꾼·명사수·선봉대**를 묶음 단위로 대기열에
   넣으면, 각 묶음이 훈련 시간이 지난 뒤 완성되어 보유 병력에 합류합니다.
5. **전투.** 병력을 전투로 보내 점점 강해지는 서리 군단 웨이브(**서리 늑대·파괴자·
   서리 거인**)를 막아냅니다. 결과는 전투 시스템이 결정론적으로 계산한 뒤
   애니메이션으로 연출됩니다. 승리하면 자원 보상을 얻고 웨이브 진행이 올라가며,
   패배하면 병력은 잃지만 성채는 건재합니다. 전투 HUD의 **건너뛰기**와 **속도**로
   진행 속도를 조절할 수 있습니다.
6. **더 어렵게, 반복.** 웨이브를 하나 격파할 때마다 다음 웨이브의 난이도가
   올라갑니다. 마지막으로 설정된 웨이브를 격파하면 전체 캠페인 승리입니다.

**설정**에서는 전체 / 효과음 / 음악 볼륨 슬라이더와 언어 토글(한국어 / English)을
제공하며 모두 `localStorage`에 저장됩니다. 또한 두 번 눌러 확인하는 **진행
초기화** 옵션으로 저장을 지우고 새 성채를 시작할 수 있습니다.

> **언어 설정 (한국어 / English).** 게임은 **한국어 우선**입니다. 저장된 설정이
> 없는 첫 실행에서는 브라우저 언어를 자동 감지합니다. 브라우저의 선호 언어가
> `ko`로 시작하면 한국어로, 그 외에는 영어로 시작하며, 감지할 수 없을 때는
> 한국어로 되돌아갑니다. 한 번이라도 언어를 직접 고르면 그 선택이 저장되어 이후
> 항상 우선합니다. 언어는 **타이틀 화면 우측 상단의 토글**(◀ 한국어 ▶)이나
> **설정** 화면에서 언제든 바꿀 수 있으며, 모든 라벨이 즉시 전환됩니다.

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
                   CombatSystem, CasualtyTimeline, WarmthSystem, SaveManager,
                   GameState + AudioManager, SettingsStore
  ui/              공용 픽셀 UI 헬퍼: Menu, TrainingPanel, BattleHud, UiText
  types/           공용 횡단 타입
  i18n/            한국어 우선 KO/EN 문자열 테이블 + 소형 런타임
public/assets/     오리지널 스프라이트, 배경, UI, FX, 오디오
tools/             에셋 생성기 (gen_sprites.py, gen_audio.py)
```

`systems/`의 클래스에는 **Phaser 의존성이 없어서**, 자원 계산, 업그레이드 비용
공식, 훈련 대기열 타이밍, 전투 계산, **화로 온기(WarmthSystem) 로직**, 저장
직렬화, 그리고 설정 로드(브라우저 언어 자동 감지 포함)가 모두 빠른 `vitest`
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

프로덕션 빌드는 Vite `base`를 `/game-whiteout/`로 설정하여 프로젝트 페이지 경로
아래에서 에셋 URL이 올바르게 해석되도록 합니다.

### 자동 (GitHub Actions — 권장)

`main`에 푸시하면
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)이 실행되어
`npm ci && npm run build`를 수행하고, `dist/`를 Pages 아티팩트로 업로드한 뒤
`actions/deploy-pages`로 게시합니다. 저장소에서 한 번
**Settings → Pages → Build and deployment → Source: GitHub Actions**를 설정해
두면, `main`에 푸시할 때마다 <https://savagemanage.github.io/game-whiteout/>로
재배포됩니다.

### 수동 (`npm run build` + `gh-pages` 대체)

직접 게시하고 싶거나 Actions를 사용할 수 없을 때:

```bash
npm run build                     # dist/ 생성
npx gh-pages -d dist              # dist/를 gh-pages 브랜치로 푸시
```

그런 다음 **Settings → Pages → Source: Deploy from a branch → `gh-pages` /
root**를 설정하세요. 사이트는 동일한
<https://savagemanage.github.io/game-whiteout/> 주소로 제공됩니다.

## 크레딧

모든 아트와 오디오는 이 프로젝트의 오리지널 창작물이며 [`tools/`](tools/)의
스크립트로 생성됩니다. 전체 파일별 출처와 라이선스는
[`assets/CREDITS.md`](assets/CREDITS.md)에 기록되어 있습니다.

## 라이선스

Apache-2.0. [LICENSE](LICENSE)를 참고하세요.

---

<a id="english"></a>

**[한국어](#korean) · [English](#english)**

# Frosthold: Last Ember (서리성채: 마지막 불씨)

An original-world 2D pixel-art **frozen-survival city-builder / idle** browser
game. The world is locked in an endless winter and your settlement survives
around a single central **Furnace**: burn **wood and coal** in its **Ember** to
hold back a lethal cold — let the fuel run dry and warmth decays, throttling
production. Resource buildings passively generate **food, wood, coal, and
iron**; the central **Furnace** gates how far every other building can be
upgraded; troops are trained in time-based **queues** at the **War Camp**; and
periodic **waves of the Frozen Horde** must be repelled in an animated,
deterministic battle. Progress is saved to `localStorage`, with idle gains
credited while you are away. The UI is **Korean-first** (한국어), with English
available.

> **Original work / IP boundary.** Frosthold: Last Ember is an **original** game
> *inspired by* the frozen-survival city-builder genre. All names, lore, art,
> and audio are original to this project. It does **not** use "Whiteout
> Survival" (or any other third-party) names, characters, factions, story,
> logos, art, or audio. See [`assets/CREDITS.md`](assets/CREDITS.md) for full
> asset provenance.
>
> The repository slug and GitHub Pages path (`game-whiteout`,
> `savagemanage.github.io/game-whiteout`) are only a fixed **deployment
> identifier**; they are not part of the game's brand. Nothing shipped in the
> build (the in-game title "Frosthold: Last Ember / 서리성채: 마지막 불씨", the
> lore, the troop/enemy names, the art, and the audio) uses any third-party IP.
> The slug is a fixed deployment target and is intentionally left unchanged.

**Play the live build:** <https://savagemanage.github.io/game-whiteout/>

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
with; see [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)).

```bash
npm install       # install dependencies
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
| **Click War Camp / War Camp button** | Open the troop training panel               |
| `B`                  | March **To Battle** (from the Town)                           |
| `S`                  | Open **Settings** (from the Title or Town)                    |
| `Esc`                | Close the open panel / skip the battle animation              |
| `Space`              | Play/Continue (Title) · return **To Town** (Game Over)        |
| `R`                  | **Retry** the battle (Game Over)                              |

### The core loop

1. **Gather (idle).** The Hunters' Hut, Sawmill, Coal Pit, and Iron Mine
   generate food, wood, coal, and iron over time — even while the tab is closed.
   Offline time is credited (capped and scaled) the next time you load, with a
   summary of what you gathered.
2. **Keep warm (the Furnace).** The **Furnace** burns **wood and coal** every
   second to sustain your settlement's Warmth. While fuel is available warmth
   climbs to its max; when the stockpile runs dry warmth decays and idle
   production is throttled toward a floor. A higher Furnace level raises max
   warmth *and* makes fuel burn more efficiently, so investing in the Ember pays
   off twice.
3. **Upgrade.** Every building upgrades for a geometrically growing cost and a
   build timer. The **Furnace** level caps the level of every other building, so
   it is the backbone of your progression.
4. **Train.** Queue batches of **Trappers, Marksmen, and Vanguards** at the War
   Camp; each batch completes after its training time and joins your standing
   army.
5. **Battle.** Send your army To Battle to repel escalating waves of the Frozen
   Horde (**Frost Wolf, Ravager, Frost Titan**). The outcome is resolved
   deterministically by the combat system and then animated; on a win you earn
   resource rewards and advance your wave progress, on a loss your army is lost
   but the hold stands. Use **Skip** and **Speed** in the battle HUD to control
   pacing.
6. **Repeat, harder.** Each cleared wave raises the difficulty of the next.
   Clearing the final configured wave is a full-campaign victory.

**Settings** offers master / SFX / music volume sliders and a language toggle
(한국어 / English), all persisted to `localStorage`, plus a two-press
**Reset Progress** option that wipes the save and starts a fresh hold.

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
                   CombatSystem, CasualtyTimeline, WarmthSystem, SaveManager,
                   GameState + AudioManager, SettingsStore
  ui/              Shared pixel-UI helpers: Menu, TrainingPanel, BattleHud, UiText
  types/           Shared cross-cutting types
  i18n/            Korean-first KO/EN string table + tiny runtime
public/assets/     Original sprites, backgrounds, UI, FX, and audio
tools/             Asset generators (gen_sprites.py, gen_audio.py)
```

The `systems/` classes contain **no Phaser dependency**, so the resource math,
upgrade-cost formulas, training-queue timing, combat resolution, the **Furnace
warmth logic (WarmthSystem)**, and save serialization are all covered by fast
`vitest` unit tests (`src/**/*.test.ts`).

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

The production build sets the Vite `base` to `/game-whiteout/` so asset URLs
resolve under the project-pages path.

### Automatic (GitHub Actions — recommended)

Pushes to `main` trigger [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml),
which runs `npm ci && npm run build`, uploads `dist/` as a Pages artifact, and
publishes it with `actions/deploy-pages`. Enable **Settings → Pages → Build and
deployment → Source: GitHub Actions** on the repository once, and every push to
`main` redeploys to <https://savagemanage.github.io/game-whiteout/>.

### Manual (`npm run build` + `gh-pages` fallback)

If you prefer to publish by hand (or Actions is unavailable):

```bash
npm run build                     # produces dist/
npx gh-pages -d dist              # push dist/ to the gh-pages branch
```

Then set **Settings → Pages → Source: Deploy from a branch → `gh-pages` / root**.
The site serves at the same <https://savagemanage.github.io/game-whiteout/> URL.

## Credits

All art and audio are original to this project and generated by the scripts in
[`tools/`](tools/). Full per-file provenance and licensing is recorded in
[`assets/CREDITS.md`](assets/CREDITS.md).

## License

Apache-2.0. See [LICENSE](LICENSE).
