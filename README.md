# wirework

**[English](#english) | [한국어](#한국어)**

A 3D grapple-action prototype built in **Godot 4.7.2** (GDScript only,
Compatibility renderer so it can export to the browser via WebGL 2.0).

---

<a id="english"></a>

## English

You fight a group of giants with grappling gear. Swing in on your wire, get
level with the glowing red **nape** at the back of a giant's neck, and slash it
while your swing carries you across. The premise the project sets out to prove:
the giants' count and stats never change round to round - difficulty rises only
through evolved strategy. Specs 1-4 (traversal-core, telemetry, evolution-core,
evolution-screen) are all implemented and merged.

### Requirements

- [Godot 4.7.2](https://godotengine.org/download) - the **standard** build
  (NOT the .NET / C# build; this project is pure GDScript).

### How to run

1. Launch Godot 4.7.2.
2. Click **Import**, browse to this folder, select `project.godot`, then **Open**.
3. Press **F5** (or the play button, top-right) to run.

> **First open imports the bundled assets.** The CC0 ground/rock textures under
> `assets/textures/` and the spark sprite under `assets/particles/` ship without
> their generated `.import` sidecars (this repo's `.gitignore` excludes
> `*.import` and `.godot/`, same as the localized `.translation` files). The
> editor generates them automatically on that first **Import/Open**; until then
> Godot shows a placeholder for an un-imported texture and the slash spark falls
> back to its procedural look, so nothing crashes. See `assets/CREDITS.md` for
> full source/license details.

The game opens on a **Start screen** (title + **Settings**). On this screen you
choose the language (**Korean / English**) and press **Start / Play** to enter
the game; your language choice is remembered between sessions. After you start, a
brief **"Baking navigation..."** screen appears while the navigation mesh is
built at runtime, then the round begins. The navmesh is baked at runtime - no
editor baking step is required.

### Controls

| Action        | Input                     |
|---------------|---------------------------|
| Move          | `W` `A` `S` `D`           |
| Jump          | `Space`                   |
| Look around   | Mouse (captured on start) |
| Grapple / wire| Left mouse button (hold to swing, hold `Space` to reel in) |
| Slash         | Right mouse button        |
| Release mouse | `Esc`                     |

Click back in the window after pressing `Esc` to re-capture the mouse.

#### How a round plays

1. Four giants spawn and path toward you. Their count and stats are FIXED and
   never scale with the round number.
2. Grapple onto a tower, plateau or cliff and swing up toward a giant's red nape.
3. Right-click to **slash** while your swing carries the blade across the nape.
   Damage is continuous: a fast blade slicing along the nape kills; a weak or
   badly-angled hit only staggers the giant and bounces you off.
4. When all four are down, the round counter advances and four identical giants
   respawn.

### Headless GA evolution harness

To evolve giant strategies headlessly (no window), run this from the
`titan-game/` project root:

```
godot --headless --path . --script res://scripts/evo/harness/ga_harness.gd
```

It evolves the giants against three scripted players - **always-left**,
**random** and **mixed** - for **200 generations** and writes CSVs to `user://`:

- `ga_genes_always-left.csv`, `ga_genes_random.csv`, `ga_genes_mixed.csv` -
  the per-generation gene trajectory for each scripted opponent.
- `ga_killtime_<kind>.csv` - an evolved-vs-baseline kill-time proxy for each
  opponent kind.

The harness prints the absolute (globalized) path of each CSV on completion, so
you can find exactly where they landed (see save locations below).

### Localization

The UI is available in **Korean** and **English**. The language is selectable on
the Start screen and persisted across sessions. To add strings or a new language:

1. Edit `locale/ui.csv` - add a column for a new locale, and/or add rows for new
   string keys.
2. Re-import the CSV in the Godot editor (this regenerates the `.translation`
   resources).
3. List the new `.translation` file under `[internationalization]` in
   `project.godot`.

### Browser / web-export target

This project targets a WebGL 2.0 browser export:

- **Compatibility** renderer (`gl_compatibility`) - Forward+ and Mobile do not
  run on the web.
- **Single-threaded** export: no threading APIs (`Thread`/`Mutex`/`Semaphore`/
  `WorkerThreadPool`); heavy work is split across frames.
- GDScript only (no C#), no low-level networking - everything runs locally, and
  `user://` persistence is backed by IndexedDB per origin. Save failures are
  treated as non-fatal.

To export: **Project → Export → Add… → Web**, install the Web export templates
if prompted, then **Export Project**. Serve the exported files over HTTP
(browsers will not run the `.wasm` from a `file://` URL).

### Save file locations

Persistence uses `user://`, which resolves to the per-app user data dir:

- **Windows:** `%APPDATA%/Godot/app_userdata/wirework`
- **macOS:** `~/Library/Application Support/Godot/app_userdata/wirework`
- **Linux:** `~/.local/share/godot/app_userdata/wirework`
- **Web export:** backed by IndexedDB per origin.

Files written there:

- `wirework_telemetry.json` - recorded telemetry (spec 2).
- `wirework_evo.json` - evolution snapshot (spec 3).
- `wirework_settings.json` - saved settings, including the chosen language.

Save failures are treated as non-fatal (e.g. `user://` may be wiped in incognito
mode), so the game keeps running with clean defaults.

### Project layout

```
titan-game/
├── project.godot          # project config: renderer, input map, physics layers, translations
├── locale/
│   └── ui.csv             # KO/EN UI strings (imported to .translation)
├── scenes/
│   ├── Main.tscn          # arena + player + GameManager + loading screen + UI
│   ├── Arena.tscn         # single high-verticality terrain chunk + NavigationRegion3D + spawn markers
│   ├── Player.tscn        # CharacterBody3D + camera rig + Grapple + Slash (ShapeCast3D)
│   └── Titan.tscn         # giant CharacterBody3D + NavigationAgent3D + Nape kill-zone
└── scripts/
    ├── player/            # camera-relative WASD, mouse-look, grapple, slash
    ├── titan/             # NavigationAgent3D chase, nape, gene consumption
    ├── evo/               # scene-free evolution core + headless GA harness
    ├── telemetry/         # round recording, engagement windows, player model
    └── ui/                # start screen, loading screen, round-end panel, evolution screen
```

### Roadmap / status

All four specs are implemented and merged:

- **Spec 1 - traversal-core:** swinging, slashing, four fixed giants that chase.
- **Spec 2 - telemetry:** player behaviour and giant nape-exposure recording;
  a round-end panel with a 24-bin player model.
- **Spec 3 - evolution-core:** a pure, scene-free evolution core in
  `scripts/evo/` that evolves six strategy genes on a background fixed-step
  simulation.
- **Spec 4 - evolution-screen:** learning visualisation, ending in a
  split-screen comparison of the first-generation baseline against the latest
  generation.

---

<a id="한국어"></a>

## 한국어

그래플 장비로 거인 무리와 싸운다. 와이어로 스윙해 접근한 뒤, 거인 목 뒤쪽에서
붉게 빛나는 **네이프(nape)** 와 높이를 맞추고, 스윙이 몸을 실어 지나가는 동안
베어낸다. 이 프로젝트가 증명하려는 전제: 거인의 수와 스탯은 라운드가 올라가도
절대 변하지 않으며, 난이도는 오직 진화한 전략만으로 올라간다. 스펙 1-4
(traversal-core, telemetry, evolution-core, evolution-screen)는 모두 구현되어
병합되었다.

### 요구 사항

- [Godot 4.7.2](https://godotengine.org/download) - **standard(표준) 빌드**
  (.NET / C# 빌드가 **아님**; 이 프로젝트는 순수 GDScript다).

### 실행 방법

1. Godot 4.7.2 를 실행한다.
2. **Import** 를 클릭하고 이 폴더로 이동해 `project.godot` 을 선택한 뒤 **Open**.
3. **F5** (또는 우측 상단 재생 버튼)를 눌러 실행한다.

게임은 **시작 화면**(타이틀 + **설정**)으로 열린다. 이 화면에서 언어
(**한국어 / 영어**)를 고르고 **Start / Play** 를 눌러 게임에 진입한다. 선택한
언어는 세션 간에 기억된다. 시작하면 잠깐 **"Baking navigation..."**(내비게이션
베이크) 화면이 나타나며 이때 내비게이션 메시가 **런타임에** 생성되고, 이어서
라운드가 시작된다. 내비메시는 런타임 베이크이므로 **에디터에서 수동으로
베이크할 필요가 없다**.

### 조작

| 동작          | 입력                         |
|---------------|------------------------------|
| 이동          | `W` `A` `S` `D`              |
| 점프          | `Space`                      |
| 시점 회전     | 마우스 (시작 시 커서 고정)   |
| 그래플 / 와이어| 마우스 좌클릭 (누르고 있으면 스윙, `Space` 를 누르면 당김) |
| 슬래시        | 마우스 우클릭                |
| 마우스 해제   | `Esc`                        |

`Esc` 로 마우스를 해제한 뒤에는 창을 다시 클릭하면 커서가 재고정된다.

#### 라운드 진행 방식

1. 거인 4마리가 스폰되어 플레이어를 향해 경로를 잡는다. 마릿수와 스탯은
   **고정**이며 라운드 번호에 따라 절대 스케일되지 않는다.
2. 탑, 고원, 절벽에 그래플을 걸고 스윙해 거인의 붉은 네이프 쪽으로 올라간다.
3. 스윙이 칼날을 네이프 위로 실어 나르는 동안 **우클릭으로 슬래시**한다.
   데미지는 연속값이다. 빠른 칼날이 네이프를 따라 베면 처치되고, 약하거나
   각도가 나쁜 타격은 거인을 경직시키기만 하고 플레이어를 튕겨낸다.
4. 4마리를 모두 쓰러뜨리면 라운드 카운터가 올라가고 동일한 거인 4마리가
   다시 스폰된다.

### 헤드리스 GA 진화 하네스

거인 전략을 창 없이(헤드리스) 진화시키려면 `titan-game/` 프로젝트 루트에서
다음을 실행한다:

```
godot --headless --path . --script res://scripts/evo/harness/ga_harness.gd
```

세 종류의 스크립트 플레이어 - **always-left**, **random**, **mixed** - 를
상대로 **200세대** 를 진화시키며, CSV 를 `user://` 에 기록한다:

- `ga_genes_always-left.csv`, `ga_genes_random.csv`, `ga_genes_mixed.csv` -
  각 스크립트 상대에 대한 세대별 유전자 궤적.
- `ga_killtime_<kind>.csv` - 상대 종류별 진화 대 베이스라인 킬 타임 프록시.

하네스는 완료 시 각 CSV 의 절대(globalized) 경로를 출력하므로, 파일이 정확히
어디에 저장되었는지 알 수 있다(아래 저장 위치 참조).

### 현지화(Localization)

UI 는 **한국어** 와 **영어** 로 제공된다. 언어는 시작 화면에서 선택할 수 있고
세션 간에 유지된다. 문자열이나 새 언어를 추가하려면:

1. `locale/ui.csv` 를 편집한다 - 새 로케일용 열을 추가하거나, 새 문자열 키에
   대한 행을 추가한다.
2. Godot 에디터에서 CSV 를 다시 임포트한다(이때 `.translation` 리소스가
   재생성된다).
3. `project.godot` 의 `[internationalization]` 아래에 새 `.translation` 파일을
   등록한다.

### 브라우저 / 웹 익스포트 대상

이 프로젝트는 WebGL 2.0 브라우저 익스포트를 대상으로 한다:

- **Compatibility** 렌더러(`gl_compatibility`) - Forward+ 와 Mobile 은 웹에서
  돌지 않는다.
- **싱글스레드** 익스포트: 스레딩 API(`Thread`/`Mutex`/`Semaphore`/
  `WorkerThreadPool`) 금지; 무거운 작업은 프레임에 나눠 처리한다.
- GDScript 전용(C# 없음), 저수준 네트워킹 없음 - 모든 것은 로컬에서 돌며,
  `user://` 영속성은 오리진별 IndexedDB 로 뒷받침된다. 저장 실패는 치명적이지
  않은 것으로 처리한다.

익스포트 방법: **Project → Export → Add… → Web**, 안내가 나오면 Web 익스포트
템플릿을 설치한 뒤 **Export Project**. 익스포트된 파일은 HTTP 로 서빙한다
(브라우저는 `file://` URL 에서 `.wasm` 을 실행하지 않는다).

### 저장 파일 위치

영속성은 `user://` 를 사용하며, 이는 앱별 사용자 데이터 디렉터리로 해석된다:

- **Windows:** `%APPDATA%/Godot/app_userdata/wirework`
- **macOS:** `~/Library/Application Support/Godot/app_userdata/wirework`
- **Linux:** `~/.local/share/godot/app_userdata/wirework`
- **웹 익스포트:** 오리진별 IndexedDB 로 뒷받침된다.

여기에 기록되는 파일:

- `wirework_telemetry.json` - 기록된 텔레메트리(스펙 2).
- `wirework_evo.json` - 진화 스냅샷(스펙 3).
- `wirework_settings.json` - 선택한 언어를 포함한 설정.

저장 실패는 치명적이지 않은 것으로 처리하므로(예: 시크릿 모드에서 `user://` 가
날아갈 수 있음), 게임은 초기 기본값으로 계속 진행된다.

### 프로젝트 구조

```
titan-game/
├── project.godot          # 프로젝트 설정: 렌더러, 입력 맵, 물리 레이어, 번역
├── locale/
│   └── ui.csv             # KO/EN UI 문자열 (.translation 으로 임포트)
├── scenes/
│   ├── Main.tscn          # 아레나 + 플레이어 + GameManager + 로딩 화면 + UI
│   ├── Arena.tscn         # 수직성이 큰 지형 한 덩어리 + NavigationRegion3D + 스폰 마커
│   ├── Player.tscn        # CharacterBody3D + 카메라 리그 + Grapple + Slash (ShapeCast3D)
│   └── Titan.tscn         # 거인 CharacterBody3D + NavigationAgent3D + 네이프 킬존
└── scripts/
    ├── player/            # 카메라 상대 WASD, 마우스룩, 그래플, 슬래시
    ├── titan/             # NavigationAgent3D 추격, 네이프, 유전자 소비
    ├── evo/               # 씬 비참조 진화 코어 + 헤드리스 GA 하네스
    ├── telemetry/         # 라운드 기록, 교전 윈도우, 플레이어 모델
    └── ui/                # 시작 화면, 로딩 화면, 라운드 종료 패널, 진화 화면
```

### 로드맵 / 상태

네 개 스펙 모두 구현되어 병합되었다:

- **스펙 1 - traversal-core:** 스윙, 슬래시, 추격하는 고정 거인 4마리.
- **스펙 2 - telemetry:** 플레이어 행동과 거인 네이프 노출 기록; 24칸 플레이어
  모델을 담은 라운드 종료 패널.
- **스펙 3 - evolution-core:** `scripts/evo/` 안의 순수·씬 비참조 진화 코어로,
  백그라운드 고정 스텝 시뮬레이션에서 여섯 개 전략 유전자를 진화시킨다.
- **스펙 4 - evolution-screen:** 학습 시각화. 마지막에 1세대 베이스라인과 최신
  세대를 좌우로 비교하는 화면으로 마무리된다.
