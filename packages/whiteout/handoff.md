# Handoff — Frosthold: Last Ember (서리성채: 마지막 불씨)

## 무엇을 했나 (Summary)

플레이어가 남긴 두 가지 불만을 해결했습니다:

1. **직관적이지 않은 진행** — 첫 세션 온보딩/가이드 흐름 (다음 목표 배너, 다음
   행동 건물의 포인터/글로우, 잠긴 건물에 "잠김" 대신 해금 조건 라벨, 저강도 안내).
   저장에 영속화되고 건너뛸 수 있습니다. *(이전 작업, 그대로 보존됨)*
2. **폰트가 crisp하지 않음** — UI/HUD/패널 텍스트가 흐릿하던 문제를 렌더 파이프라인
   수정으로 해결. *(이번 작업의 핵심)*

모두 `main`에 머지 완료. **push/배포는 하지 않았습니다** (오케스트레이터 담당).

## 이번에 고친 실제 버그 (The crisp-text fix)

이전 crisp-text 수정은 백버퍼 크기를 `window.devicePixelRatio`에만 연동했습니다.
`devicePixelRatio === 1`인 일반 데스크톱에서 Scale.FIT이 960x540 논리 캔버스를 큰
창(예: 1920x1080, 2배 확대)으로 CSS 확대하면 백버퍼가 960x540에 머물러 브라우저가
업스케일 → 텍스트가 계속 흐릿했습니다. 캔버스의 실제 화면 배율은
`devicePixelRatio * (표시 CSS 크기 / 논리 크기)`이지 DPR만이 아닙니다.

### 변경 내용

- **`src/ui/renderScale.ts`** (순수/Phaser-free): `resolveRenderScale`가 이제
  DPR과 표시-대-논리 비율을 **함께** 사용해 정수 배율을 계산합니다.
  - `ratio = max((dispW*dpr)/logicalW, (dispH*dpr)/logicalH)`, `Math.ceil`로 올림
    (표시 해상도 아래로 내려가 재-업스케일되지 않도록), `[1, 4]`로 클램프.
  - `MAX_RENDER_SCALE`를 3(DPR 기준, 버그의 공범)에서 **4**(실제 표시 픽셀 기준)로
    재정의 — 4K(2160p) 창의 4배 요구까지 커버하면서 과도한 할당 방지.
  - 퇴화 입력(비유한/음수 DPR·크기)은 안전한 1x로 폴백. 한 축만 측정 불가면 유효한
    축을 사용.
- **`src/main.ts`**: `#game` 컨테이너를 측정해 부팅 시 플랜을 만들고, **window
  resize마다** 재계산(`game.scale.resize()` + 모든 카메라 재-zoom). Scale.FIT +
  카메라 zoom 아키텍처 유지 → 960x540 논리 좌표계·레이아웃·포인터 입력 불변,
  스프라이트는 NEAREST(pixelArt) 유지.
- **`src/ui/renderScale.test.ts`**: 새 동작 커버 (DPR×CSS 비율, 올림, 축별 max,
  클램프, resize 재계산, 퇴화 입력). 테스트 293 → **300**.

### 검증 (dpr=1, 1920x1080 창 = 오케스트레이터 재현 케이스)

헤드리스 Chromium으로 확인:
- 백버퍼: **1920x1080** (이전 960x540) — 텍스트가 표시 해상도로 래스터화.
- dpr=1 논리 960x540: 백버퍼 960x540 (1:1, 낭비 없음).
- dpr=2 1920x1080: 백버퍼 3840x2160 (CSS 2배 × DPR 2 = 4배).
- 활성 씬 카메라: `zoom=2, scroll=(-480,-270)` — 논리 (0,0) 앵커 정확.
- 스크린샷 재생성 (`tools/capture_screenshots.mjs`): 한글 실제 글리프(두부 없음),
  텍스트 crisp, 스프라이트 픽셀아트 유지 확인.

## 검사 상태 (three checks)

| 검사 | 명령 | 결과 |
|------|------|------|
| Typecheck | `npm run typecheck` | ✅ clean (strict TS) |
| Test | `npm run test` | ✅ 300 passed / 27 files |
| Build | `npm run build` | ✅ `/open-games/whiteout/` base로 dist 생성 |

## Git 상태

- `main` HEAD: `41dc772` — `fix/crisp-text-display-scale`를 `--no-ff` 머지.
  crisp-text 온보딩 작업 전체 + 이번 백버퍼 수정 포함.
- 정리한 브랜치 (main에 머지 완료 후 삭제): `feat/crisp-text-onboarding`,
  `fix/crisp-text-display-scale`.
- **남겨둔 브랜치** (이 작업과 무관): `docs/readme-overhaul` (미머지 별도 작업),
  이미 머지된 `ci/pages-deploy`·`feat/wos-faithful-expansion`·
  `fix/live-visual-defects`·`fix/ui-margins-favicon`. 로컬 정리만 했고 원격은
  건드리지 않았습니다.

## 남은 일 / 주의

- **Push/배포는 하지 않음** — 오케스트레이터가 push하면 GitHub Pages
  (https://savagemanage.github.io/open-games/whiteout/)로 자동 배포됩니다.
- `.github/workflows/*`는 수정하지 않았습니다.
- 보존된 이전 수정: 번들 한글 폰트(두부 없음), Town 재진입 크래시 수정, HUD 밴드
  분리/대비, 좌우 여백, 파비콘, 배틀 벽/라벨, 온보딩 목표/포인터/해금 라벨.

## STEERING (steer-c29ad6e5)

사용자 요청대로 (1) 모든 작업을 로컬 `main`에 머지, (2) crisp-text 관련 브랜치
정리, (3) 이 handoff.md 작성 완료. push는 위임 제약과 오케스트레이터 정책상 하지
않았습니다 (push/배포는 오케스트레이터 담당).
