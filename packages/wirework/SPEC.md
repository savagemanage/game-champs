# Wirework 목표 제품 스펙

- 상태: **권위 있는 목표 사양(Target Product Specification)**
- 적용 범위: `packages/wirework`
- 기준 버전: 제품 1.0 목표
- 근거: `README.md`, `CONTRIBUTING.md`, `game.json`, `package.json`, `src/config`, `src/systems`, `src/scenes`, 엔티티 및 테스트

## 1. 문서 권위와 규범

1. 이 문서는 Wirework가 **무엇이어야 하는지**를 정의하는 제품·게임플레이·품질의 최상위 기준이다. 현재 구현을 설명하는 문서가 아니다.
2. 이 문서와 README, 코드, 주석, 테스트, 기존 수치가 충돌하면 이 문서가 우선한다. 구현과 테스트는 이 문서에 맞춰야 한다.
3. **MUST/해야 한다**는 출시 차단 요구사항, **MUST NOT/해서는 안 된다**는 금지사항, **SHOULD/권장한다**는 합리적 예외가 문서화되지 않는 한 지켜야 하는 요구사항, **MAY/할 수 있다**는 선택사항이다.
4. 밸런스 수치와 판정 규칙을 변경하는 PR은 이 문서와 중앙 config, 관련 자동 테스트를 같은 변경에서 함께 갱신해야 한다.
5. 애매한 동작은 구현자가 임의로 정하지 않는다. 이 문서에 없는 제품 결정을 추가할 때는 먼저 이 문서를 개정한다.

## 2. 제품 정의

### 2.1 비전과 타깃

Wirework는 오리지널 테크 판타지 세계관의 2D 픽셀아트 **탑다운 방호환 방어 액션**이다. 축전 도시의 아크 수호자는 축전 테더·플링·대시로 이중 방호환을 횡단하며, 자율 공성기계의 후방 냉각 노드를 아크 절단기로 파괴해 중심구 주민 12명을 8개 웨이브 동안 지킨다. 적은 인간형 생물이 아니라 역할별 기계 실루엣과 스파크·냉각수 효과를 가진 침입 자동기계여야 한다.

1. 1차 타깃은 정밀한 키보드+마우스 조작, 짧은 반복 런, 점수 향상을 선호하는 데스크톱 브라우저 액션 플레이어다.
2. 폭력 표현은 비현실적 픽셀아트·증기·스파크 수준이어야 하며 사실적 유혈이나 고어를 사용해서는 안 된다.
3. 모든 명칭, 설정, 적 역할, 시각·음향 자산은 오리지널 또는 재배포 가능한 라이선스여야 한다. 제3자 IP의 고유명사·캐릭터·설정·자산을 사용해서는 안 된다.

### 2.2 플랫폼과 세션

1. 지원 플랫폼은 최신 2개 주요 버전의 데스크톱 Chrome, Edge, Firefox, Safari다.
2. **데스크톱 우선**이며 기본 입력은 키보드+2버튼 마우스다. 게임패드는 1.0 접근성 목표다.
3. 터치 화면은 레이아웃 열람과 메뉴 표시만 가능하며, **touch 게임플레이는 명시적으로 지원하지 않는다**. 불완전한 탭 축전 테더나 가상 스틱을 지원 기능처럼 노출해서는 안 된다.
4. 한 런은 영구 성장 없는 8웨이브 세션이며 Standard 첫 클리어 목표 시간은 10~15분, 일반 실패 런은 3~10분이다.
5. 런 중 저장·이어하기는 제공하지 않는다. 새로고침, 탭 종료, 브라우저 종료는 현재 런을 종료한다.

### 2.3 제품 원칙

1. **이동이 공격이다:** 축전 테더 이동, 후방 냉각 노드 접근, 플링 속도 보존이 하나의 연속 동작이어야 한다.
2. **읽을 수 있는 압박:** 적 역할, 공격 예고, 약점, 방벽 손상, 자원 부족을 1초 안에 구분할 수 있어야 한다.
3. **공정한 고정 규칙:** 난이도는 적 개체의 HP·속도·피해를 몰래 올리지 않고 스폰 구성과 페이싱만 바꾼다.
4. **세 개의 방어축:** 영웅, 내벽, 시민 중 하나라도 잃을 수 있으므로 플레이어는 공격과 구조물·시민 보호를 계속 저울질해야 한다.
5. **즉시 재도전:** 패배 이유가 명확하고 재시도는 빠르되, 기록 저장과 결과 확인을 건너뛰어서는 안 된다.
6. **색상만으로 말하지 않기:** 위험, 약점, 선택, 포커스는 형태·텍스트·움직임 중 하나로 색상과 중복 표현해야 한다.

### 2.4 비목표

1. 온라인 멀티플레이, 계정, 서버 점수판, 광고, 결제, 라이브 서비스는 범위 밖이다.
2. 스토리 캠페인, 영구 성장, 장비 파밍, 메타 화폐, 웨이브 무한 모드는 1.0 범위 밖이다.
3. 물리적으로 사실적인 로프·중력·3D 전투, 적 전체 경로 탐색, 완전한 리플레이 호환성은 목표가 아니다.
4. 모바일/touch 기능 동등성 및 실시간 액션 플레이의 스크린리더 완전 지원은 목표가 아니다. 메뉴·설정·결과 정보의 접근성은 목표다.

## 3. 제품 플로우와 상태

### 3.1 필수 플로우

`Boot → Preload → Title → Game ↔ Pause → GameOver → (Game 재시도 | Title)`가 유일한 런 흐름이어야 한다.

1. **Title:** 출격, 설정, 언어 전환, 조작 안내를 제공한다. 출격은 저장된 난이도를 스냅샷해 새 Game을 만든다.
2. **Game:** 점수·타이머·웨이브·HP·charge·벽·시민을 새 값으로 초기화한다. 이전 런 객체와 예약 타이머가 남아서는 안 된다.
3. **Pause:** P 또는 포커스 손실로 진입한다. 재개, 설정, 포기 요청을 제공하며 Game 위에 중복 Pause를 만들지 않는다.
4. **GameOver:** 승패 원인, 난이도, 점수, 최고기록 여부, 완료 웨이브, 생존 시민, 활성 플레이 시간을 표시한다.
5. **Retry:** 동일 난이도의 새 seed로 완전한 새 런을 시작한다. HP 100, charge 100, 12시민, 모든 벽, 점수 0, 완료 웨이브 0, 활성 시간 0으로 재설정한다.
6. GameOver 기록 저장은 Retry/Title 입력을 받기 전에 끝나야 한다. 저장 실패는 재시도를 막지 않는다.

### 3.2 일시정지·포기·시간

1. P는 Game을 일시정지한다. Pause의 P/Esc는 재개한다.
2. Game에서 Esc 또는 Pause의 “포기”는 확인 대화상자를 열어야 한다. 기본 선택은 “계속”이며, 확인된 포기만 `abandoned` 패배로 GameOver에 기록한다.
3. 확인 없이 Title로 빠져나가는 런 종료 경로가 있어서는 안 된다.
4. 활성 플레이 타이머는 Game의 실제 조작 가능 시간만 센다. Pause, Pause 안의 Settings, 포기 확인, 브라우저 hidden/blur, GameOver 전환 500ms는 모두 제외한다.
5. Pause 중 물리, AI, 웨이브 카운트다운, 스폰, 투사체, charge 소비·회복, 애니메이션 기반 판정, 활성 타이머, 오디오는 정지해야 한다. 배경 음악은 35% 볼륨으로 낮출 수 있다.
6. 탭이 hidden되거나 창이 blur되면 자동 Pause하고 모든 눌린 키·포인터 상태를 해제한다. 포커스 복귀만으로 자동 재개해서는 안 된다.

## 4. 월드와 방어 목표

1. 물리 월드는 1280×1280, 중심은 `(640,640)`이다.
2. 외벽은 반지름 360px, 두께 22px, **24구간×60HP(총 1440HP)**다.
3. 내벽은 반지름 200px, 두께 22px, **16구간×80HP(총 1280HP)**다.
4. 시민은 매 런 **12명**으로 시작하고 중심 반지름 170px 안에서 생활한다. 평시 22px/s로 배회하고 130px 내 침입자를 감지하면 70px/s로 도주한다.
5. 각 적은 자신의 중심 방향각에 대응하는 외벽 구간을 먼저 목표로 한다. 그 외벽 구간이 무너지면 같은 각도에 대응하는 내벽 구간으로, 그 내벽 구간도 무너지면 시민으로 침투한다. 24:16 매핑은 각 구간 인덱스가 아니라 정규화된 방향각으로 계산한다.
6. 이미 뚫린 틈을 무시하고 다른 살아 있는 외벽을 공격하게 하는 전역 “외벽 전멸 후 내벽” 단계 전환은 금지한다.
7. 외벽 24구간이 모두 파괴되어도 **즉시 패배가 아니다**. 남은 내벽과 시민을 지키며 계속 플레이해야 한다.
8. 벽 구간은 HP 50% 이하에서 균열, 25% 이하에서 심한 균열, 0에서 붕괴 형태를 색상 외 실루엣으로 보여야 한다.

## 5. 웨이브·난이도·스폰

### 5.1 Standard 권위 웨이브 표

| 웨이브 | 구성(SV/SK/RM/FX/BS/BM) | 총수 | 스폰 간격 | 시작 지연 |
|---:|---|---:|---:|---:|
| 1 | SV×3 | 3 | 2000ms | 2500ms |
| 2 | SV×3, SK×2 | 5 | 1700ms | 3000ms |
| 3 | SV×3, SK×3, BM×1 | 7 | 1500ms | 3000ms |
| 4 | SV×4, FX×2, BS×1 | 7 | 1400ms | 3200ms |
| 5 | SK×4, BM×2, RM×1 | 7 | 1300ms | 3200ms |
| 6 | SV×4, BS×2, FX×3, BM×1 | 10 | 1200ms | 3400ms |
| 7 | SK×5, BS×2, BM×2, RM×1 | 10 | 1100ms | 3400ms |
| 8 | SV×4, SK×4, FX×4, BS×3, BM×3, RM×2 | 20 | 950ms | 4000ms |

역할 약어는 Surveyor(SV), Skitter(SK), Rammer(RM), Fluxborn(FX), Bastion(BS), Bombard(BM)다.

1. Standard와 Relaxed의 전체 적은 69명이다. 역할 그룹은 표 순서대로 덩어리 생성하지 않고 round-robin으로 섞는다.
2. 각 실제 스폰 간격에는 기준 간격의 ±35% jitter를 적용한다. jitter, 각도, 반경은 런 seed에서 파생한다.
3. 스폰 위치는 중심에서 무작위 방향, 반지름 450px 이상 510px 미만이다. 벽 내부, 카메라 밖의 물리 월드 외부, 다른 적과 완전히 겹치는 위치는 거부하고 다시 뽑는다.
4. 마지막 예정 적을 생성한 즉시 웨이브 상태를 clearing으로 바꾼다. 그 적까지 모두 죽으면 숨은 추가 스폰 간격 없이 웨이브를 완료한다.
5. 웨이브 8의 마지막 생존 적이 사망하면 즉시 승리 판정을 예약한다.

### 5.2 난이도

| 난이도 | 스폰 간격 배율 | 시작 지연 배율 | 추가 구성 | 총 적 |
|---|---:|---:|---|---:|
| Relaxed | ×1.40 | ×1.35 | 없음 | 69 |
| Standard | ×1.00 | ×1.00 | 없음 | 69 |
| Brutal | ×0.68 | ×0.70 | 매 웨이브 SV×2 | 85 |

1. 계산 결과는 ms 단위 반올림하며 스폰 간격 최소 200ms, 시작 지연 최소 500ms를 적용한다.
2. 난이도는 런 시작 때 한 번 고정한다. Pause Settings의 난이도 변경은 다음 런부터 적용한다.
3. 난이도는 개별 적의 HP, 속도, 공격력, 사거리, 쿨다운, 점수를 바꿔서는 안 된다.
4. 난이도별 스폰 순서와 RNG는 동일 seed에서 재현 가능해야 하며 Brutal 추가 SV도 같은 순서 생성기에 포함한다.

## 6. 조작과 브라우저 입력

### 6.1 기본 조작

| 입력 | MUST 동작 |
|---|---|
| WASD / 방향키 | 정규화된 8방향 이동 |
| Shift | 이동 중 현재 이동 방향, 정지 중 마지막 바라본 방향으로 대시 |
| 좌클릭 누름/해제 | 누르면 조준 지점으로 tether 발사·유지, 놓으면 wire 해제와 fling |
| Q / E | 부착 중 reel in / reel out |
| 우클릭 | 커서 방향 아크 절단기 sweep(`slash` action) |
| P | Pause 진입/재개 |
| Esc | Game에서는 포기 확인, Pause에서는 재개, 확인창에서는 취소 |

1. 대시는 마우스 조준 방향을 사용하지 않는다. 방향 입력과 마지막 facing이 모두 없으면 초기 facing인 위쪽으로 대시한다.
2. 좌클릭 tether은 누르는 동안 비행·부착 상태를 유지하고 해제 순간에만 release한다. 클릭 down과 같은 프레임에 자동 release해서는 안 된다.
3. 일반 이동은 서 있는 벽에 막힌다. dash 또는 wire 부착 중에는 벽을 넘을 수 있다. dash는 150ms 종료 시 player AABB가 벽과 겹치면 대시 시작점부터 종료점까지 sweep해 진행 방향의 마지막 유효 지점으로 되돌리고, 유효 지점이 없으면 대시 직전 위치로 복귀하며 해당 축 속도를 0으로 만든다. release 후 fling도 같은 sweep/최근접 유효면 규칙을 사용한다.
4. 기본 키 바인딩은 Settings에서 action 단위로 재지정하고 기본값 복원이 가능해야 한다. 이동 4방향, dash, tether, slash, reel in/out, pause는 필수 action이며 충돌 시 기존 바인딩을 해제할지 교환할지 확인한다.
5. Game canvas가 포커스되고 런/메뉴가 입력을 소유할 때 방향키·Space의 페이지 스크롤, 우클릭 context menu, canvas drag 선택 등 충돌하는 기본 동작을 막는다. Ctrl/Meta/Alt가 포함된 브라우저·OS 단축키와 canvas 밖 입력은 가로채지 않는다.
6. 포인터 down 시 canvas가 포커스를 얻고, 포커스 표시를 숨겨서는 안 된다.

### 6.2 게임패드 목표

1. 표준 XInput 계열을 지원해야 한다: 왼쪽 스틱 이동, 오른쪽 스틱 조준, RT tether, X/West slash, A/South dash, LB/RB reel, Menu pause.
2. 스틱 deadzone 기본값은 0.18이며 Settings에서 0.10~0.35로 조정한다.
3. 최근 사용 입력 장치에 따라 HUD glyph를 자동 전환하고 연결 해제 시 키보드·마우스로 안전하게 폴백한다.

## 7. 영웅 이동·charge·피해

### 7.0 권위 충돌 geometry

- 모든 수치는 world px이며 +x는 오른쪽, +y는 아래다. physics 중심 `C`를 기준으로 한 axis-aligned AABB를 쓰고 렌더 sprite 크기나 투명 여백으로 판정을 만들지 않는다.
- 영웅 AABB는 **24×32px**이고 `C`에 중심을 둔다. 벽 이동, dash/fling sweep, 투사체 피격은 모두 이 상자를 사용한다.

| 역할 | body AABB W×H | 후방 노드 거리 `d` |
|---|---:|---:|
| Surveyor | 32×48 | 18 |
| Skitter | 28×28 | 16 |
| Rammer | 58×64 | 32 |
| Fluxborn | 30×44 | 17 |
| Bastion | 48×60 | 27 |
| Bombard | 34×44 | 19 |

- 적 body AABB도 physics 중심에 고정된 axis-aligned 상자다. 현재 정규화 facing `F_e`에 대해 후방 냉각 노드 중심은 `N=C_e-F_e×d`이며 반지름은 8px다. 정지 중에는 마지막 non-zero facing을 보존하고, spawn 기본 facing은 성채 중심 방향이다.
- slash 시작 시 공격 방향 `F_s=normalize(pointer-C_player)`를 고정한다. 거리가 1px 미만이면 마지막 non-zero 조준 방향, 그것도 없으면 위쪽 `(0,-1)`을 쓴다. 오른손 법선 `R_s=(-F_s.y,F_s.x)`에 대해 권위 slash 영역은 `C_player+F_s×u+R_s×v`, `0≤u≤48`, `|v|≤22`인 닫힌 oriented rectangle이다. body hit는 이 영역과 body AABB의 교차, node hit/cue는 이 영역과 반지름 8px node 원의 교차로 판정한다. visual sweep은 이 동일 영역을 덮어야 하며 sprite alpha나 별도 원·부채꼴 hitbox를 사용해서는 안 된다.
- node hit의 후방 조건은 `|C_player-C_e|≥1`이고 `dot(normalize(C_player-C_e),F_e)<0`이다. 경계인 0과 적 중심 중첩은 body hit만 가능하다. 모든 geometry 비교는 float64 world 좌표로 하고 정확한 경계 접촉은 교차로 인정한다.

### 7.1 이동과 와이어 기동

1. 영웅 기본 이동은 200px/s, 가속 2600px/s², 마찰 2400px/s², 축별 최대 운반 속도 640px/s다.
2. 대시는 480px/s impulse, 150ms 고정, 420ms 쿨다운이며 charge 18을 선결제한다. charge가 부족하면 시작하지 않는다.
3. tether 사거리와 최대 wire 길이는 4000px, 훅 속도 1400px/s, 최소 길이는 24px다.
4. 일반 pull은 520px/s², release는 현재 속도 100%와 anchor 반대 방향 70px/s boost를 보존한다.
5. Q reel in은 190px/s, E reel out은 160px/s다. 두 동작은 wire 길이와 영웅 위치를 함께 바꾸며 anchor를 넘어가거나 24~4000px 범위를 벗어나서는 안 된다.
6. 후방 냉각 노드 tether은 34px snap 반경, 1150px/s² pull, 320px/s auto-reel, 목표 길이 40px를 사용한다. 후방 냉각 노드 tether 자체는 피해를 주지 않는다.

### 7.1.1 테더 결속점 판정과 수명

1. 발사 원점은 발사 프레임 영웅 중심 `P`다. 조준점 `A`에 대해 `|A-P|<1px`이면 miss이고, 그 외에는 방향 `D=(A-P)/|A-P|`와 선분 `[P,P+D×4000]`을 쓴다. 조준점은 ray 종점이 아니라 방향만 정한다.
2. 후보는 파괴되지 않은 방호환 segment의 44×44 world AABB와 `active=true, dying=false`인 침입 기계 body AABB다. 바닥, 장식, 파괴된 segment, dying/inactive 대상은 부착점이 아니다.
3. 각 후보의 첫 AABB 경계 교차점 중 원점과 가장 가까운 하나를 고른다. 거리가 정확히 같으면 방호환이 기계보다 우선하고, 같은 종류는 stable insertion order가 빠른 후보가 우선한다.
4. 후방 냉각 노드는 geometry를 관통하는 독립 후보가 아니다. nearest 후보가 기계이고 body 교차점과 live 노드 중심 거리가 34px 이하일 때만 node anchor로 승격한다.
5. static anchor는 ray/AABB 교차점에 고정된다. body anchor는 대상의 live `(x,y)`, node anchor는 live 노드 중심을 매 simulation step 추적한다.
6. 결속침은 매 step 현재 hook 위치에서 **현재 live anchor**를 향해 최대 `1400×dt` 이동한다. 해당 step 내 도착 가능하면 정확한 current anchor에서 attached로 전환하며 마지막 프레임 순간이동을 허용하지 않는다.
7. 유효 hit가 없거나 발사 charge 8을 전액 낼 수 없으면 miss다. miss는 charge를 소비하지 않고 기존 firing/attached tether를 바꾸지 않는다. 성공한 re-fire만 기존 tether를 원자적으로 교체한다.
8. static source가 파괴·제거되거나 moving source가 dying/inactive/despawned가 되거나 attached anchor가 영웅에서 4000px를 넘으면 다음 physics 적용 전에 강제 release한다. ghost anchor를 남겨서는 안 된다.
9. attached 강제 release는 현재 속도 100%와 anchor 반대 방향 70px/s boost를 보존한다. firing 중 강제 release는 boost 없이 취소한다. release는 source reference, node flag, line graphics, swinging 상태를 같은 step에 정리한다.
10. node anchor는 manual reel을 무시하고 1150 pull/320 auto-reel/40 목표 길이를 쓴다. static/body는 520 pull과 Q 190/E 160 reel을 쓴다.
11. firing에는 유지비가 없다. attached는 먼저 `4×dt` charge를 전액 요구하며 부족하면 pull/reel 전에 release한다. manual reel은 추가 `14×dt`를 요구하고 부족하면 실제 reel 이동량을 `paid/required` 비율로 줄인다. node auto-reel에는 추가 reel 비용이 없지만 attached 유지비는 낸다.

### 7.2 charge 경제

| 항목 | 수치 |
|---|---:|
| 최대/시작 charge | 100 / 100 |
| tether 발사 | 8 |
| reel | 초당 14 |
| wire 부착 유지 | 초당 4 |
| dash | 18 |
| 소비 후 회복 지연 | 350ms |
| 비부착·안정 상태 회복 | 초당 55 |
| fling 관성 상태 회복 | 초당 26 |

1. 일회 비용은 전액을 지불할 수 있을 때만 동작을 시작한다.
2. 연속 비용은 남은 charge 비율만큼만 효과를 적용하며 0이 되면 reel을 멈추고, 부착 유지비를 낼 수 없으면 wire를 안전하게 해제한다.
3. 소비가 발생한 프레임에는 회복하지 않는다. charge는 0~100을 벗어나서는 안 된다.
4. 새 웨이브 시작 시 charge를 자동 충전하지 않는다. 새 런/재시도에서만 100으로 초기화한다.

### 7.3 HP, i-frame, knockback

1. 최대/시작 HP는 100이다. HP가 0이면 `hero_dead`로 즉시 패배한다.
2. 유효 피격은 피해를 정수 반올림해 한 번 적용하고 800ms i-frame을 부여한다. i-frame 중 추가 melee와 투사체 피해는 0이다.
3. 유효 피격은 공격원 반대 방향으로 240px/s 순간 knockback과 260ms hurt pose를 준다. 이동 입력은 다음 프레임부터 이를 감쇠할 수 있으므로 별도 조작 잠금은 없다.
4. blink만으로 i-frame을 알리지 말고 HP flash, 짧은 outline, 피격음으로 중복 표현한다.

## 8. 아크 절단, 후방 냉각 노드 약점, Bastion 예외

1. 우클릭 slash는 기본 피해 34, 7.0의 전방 48×44 oriented rectangle, 쿨다운 300ms를 사용하며 시작 프레임의 `F_s`를 공격 전체에 고정한다.
2. hit visual, body hit, 후방 냉각 노드 판정, HUD cue는 7.0의 공유 slash geometry를 사용해야 한다. cue가 “hot”이면 그 프레임의 slash가 실제 후방 냉각 노드 판정을 내야 한다.
3. 후방 냉각 노드는 7.0 표의 역할별 중심 offset과 반지름 8px 원이다. slash 영역과 node 원이 교차하고 `dot(normalize(C_player-C_e),F_e)<0`인 후방 조건을 동시에 만족할 때만 node hit다.
4. 후방 냉각 노드 cue는 세 상태를 표시한다: 화면 내 후보는 빈 다이아몬드, slash 가능 범위·각도면 채운 다이아몬드+`CRITICAL`, tether만 가능하면 wire 아이콘이다. 색상만으로 상태를 구분해서는 안 된다.
5. **Critical kill:** Bastion를 제외한 Surveyor, Skitter, Rammer, Fluxborn, Bombard의 유효 후방 냉각 노드 slash는 남은 HP와 관계없이 즉시 처치한다. body 누적 피해로도 처치할 수 있다.
6. **Bastion 예외:** 정면 반각 70° 내 body hit는 피해 90%를 막아 기본 slash가 3 피해를 주며 금속 충돌음+청백 스파크 피드백을 낸다. 후방 body hit는 34 피해를 준다. 후방 냉각 노드는 정면 장갑을 무시하지만 즉사하지 않고 `round(34×3)=102` 피해를 주므로 풀 HP 150에서 critical 2회가 필요하다.
7. 일반/critical stagger는 각각 260/520ms, 사망 연출은 420ms다. hit-stop은 normal 35ms, critical 60ms, kill 90ms이며 simulation 판정 순서를 바꾸지 않는다.
8. 후방 냉각 노드 처치에 별도 점수 배율은 없다. cue, 텍스트, 효과가 보너스 점수를 암시해서는 안 된다.

## 9. 적 역할과 AI

| 역할 | HP | 속도 | 공격 | 후방 냉각 노드 | 쿨다운 | 사거리 | 점수 | 고유 역할 |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| Surveyor | 90 | 42 | 8 | ×3/즉사 | 1100ms | 46 | 100 | 기준 공성, 기회성 영웅 추적 |
| Skitter | 50 | 120 | 6 | ×3.5/즉사 | 850ms | 40 | 120 | 360px 이내 ×1.6 돌진 |
| Rammer | 260 | 26 | 26 | ×2.4/즉사 | 1600ms | 58 | 260 | 벽 우선 중공성 |
| Fluxborn | 70 | 88 | 10 | ×3.5/즉사 | 700ms | 42 | 160 | weave·twitch 비정형 접근 |
| Bastion | 150 | 40 | 14 | ×3/비즉사 | 1300ms | 48 | 220 | 정면 90% 저항 |
| Bombard | 80 | 34 | 12 | ×3/즉사 | 2200ms | 520 | 180 | 420px 이격 원거리 투척 |

1. 공통 목표 우선순위는 (a) 확정된 영웅 위협 commitment, (b) 자신의 방향각에서 아직 서 있는 외벽, (c) 대응 내벽, (d) 가장 가까운 생존 시민이다.
2. 영웅이 150px 이내이면 240ms decision cadence마다 역할별 전환 확률을 평가한다: SV 0.45/900ms, SK 0.85/1100ms, RM 0.08/500ms, FX 0.70/800ms, BS 0.25/700ms, BM 0/0. 앞 숫자는 전환 확률, 뒤 숫자는 commitment 지속시간이다.
3. melee 적은 commitment 중 영웅 60px 이내에서만 공격한다. 130ms lunge를 먼저 예고하고 impact 시점에 거리와 i-frame을 재검사해 피해를 적용한다.
4. 주민 공격은 내벽 틈을 실제 통과한 적만 수행한다. 적 공격점 60px 이내 가장 가까운 시민 한 명을 공격 쿨다운당 1명 제거하며, 공격 wind-up과 비명/실루엣 피드백을 제공한다.
5. Rammer는 영웅 전환 중이 아니면 시민보다 서 있는 벽을 우선하지만, 경로의 외벽과 내벽이 모두 뚫렸다면 시민을 공격할 수 있다.
6. Bombard는 melee 추적하지 않는다. 목표에서 420px 이격을 유지하고, 영웅이 540px 이내이면 영웅을, 아니면 현재 공성 목표를 조준한다.
7. Bombard 투사체는 중력 없는 직선 300px/s이며 hero 12, wall 10 피해를 준다. 화면 밖 수명 제한과 월드 경계 제거가 있어야 한다. 포물선/gravity 판정은 사용하지 않는다.
8. 모든 적 공격은 역할별 실루엣, 100ms 이상 선행 cue, impact 효과, 고유하거나 명확히 구분되는 음향을 가져야 한다.

## 10. 승리·패배·결과

1. **승리:** 웨이브 8의 모든 예정 적이 생성되고 살아 있거나 dying인 적이 0이 된 때.
2. **패배:** 다음 중 먼저 확정된 하나만 기록한다.
   - 영웅 HP 0: `hero_dead`.
   - 내벽 16구간 전부 HP 0: `inner_breached`.
   - 시민 12명 전멸: `citizens_lost`.
   - 사용자가 포기 확인: `abandoned`.
3. 외벽만 전부 파괴된 상태는 패배가 아니다. 외벽 파괴를 `inner_breached`로 오인해서는 안 된다.
4. 같은 simulation tick에 여러 패배가 생기면 `hero_dead > citizens_lost > inner_breached > abandoned` 우선순위를 적용한다. 승리와 패배가 동시에 예약되면 패배가 우선한다.
5. `wavesCompleted`는 완전히 정리한 웨이브 수다. 웨이브 1 진행 중 패배는 0, 웨이브 8 클리어는 8이다. 현재 진입 웨이브를 “생존 웨이브”로 표시해서는 안 된다.
6. GameOver 이유와 통계는 한국어·영어에서 동일 의미를 가져야 한다.

## 11. 점수와 최고기록

1. 표시 점수 공식은 **`score = Σ(플레이어가 처치한 적의 role scoreValue)`**다. 시간, critical, 벽, 시민, 웨이브, 승리에 숨은 가감점을 두지 않는다.
2. 구조물이나 시민, 다른 적, 환경으로 죽은 적은 점수를 주지 않는다. dying 상태에서 중복 점수를 지급해서는 안 된다.
3. role 점수는 SV 100, SK 120, RM 260, FX 160, BS 220, BM 180이다.
4. 가능한 전체 처치 합은 Relaxed/Standard 10,120, Brutal 11,720이다. 구성 변경 시 이 값과 테스트를 함께 갱신한다.
5. 최고기록은 `relaxed`, `standard`, `brutal`별로 로컬 저장한다. 레코드는 `score`, `wavesCompleted`, `citizensRemaining`, `activeMs`, `endedAt`을 가진다.
6. 새 기록 비교 순서는 높은 score, 높은 wavesCompleted, 높은 citizensRemaining, 짧은 activeMs다. 모두 같으면 기존 기록을 유지한다.
7. 패배 런도 최고기록 후보가 된다. 포기 런도 얻은 점수는 유지하되 결과에 “포기”를 표시한다.
8. GameOver는 현재 점수와 난이도별 최고점, `NEW RECORD` 여부를 보여야 한다. 글로벌/온라인 기록인 것처럼 표현해서는 안 된다.

## 12. HUD, 피드백, 오디오·비주얼

1. HUD는 HP, charge, 외벽 총 integrity, 내벽 총 integrity, 시민, 현재 웨이브/8, score, 활성 시간을 항상 표시한다.
2. 벽 총 integrity는 생존 구간 HP 합/초기 총 HP이며, 별도의 미니 링에 구간별 breach를 표시해 실제 침투 방향을 알 수 있어야 한다.
3. 다음 웨이브 카운트다운, spawn 중, clearing, Pause 상태를 텍스트로 표시한다. 화면 밖 긴급 적/시민 위협은 가장자리 방향 마커로 알린다.
4. low HP, empty charge, wall breach, 주민 공격, critical 가능 상태는 색상+아이콘/패턴+짧은 텍스트를 함께 사용한다.
5. 카메라 shake, flash, particles, hit-stop의 강도는 normal < critical < kill이어야 한다. 효과가 실제 hit보다 먼저 성공을 알리거나 판정을 가려서는 안 된다.
6. 오디오는 master/SFX/music 버스를 분리한다. 기본값은 0.8/0.9/0.6이며 0은 완전 mute다.
7. 최초 사용자 입력에서 WebAudio unlock을 시도하고 pointer와 keyboard 모두 지원한다. unlock 실패는 게임을 막지 않고 Settings에 음소거 상태를 표시한다.
8. 탭 hidden, Pause, OS 오디오 interruption에서 loop가 중복 생성되어서는 안 되며 재개 시 한 트랙만 이어져야 한다.
9. pixel art는 nearest-neighbour, world 좌표는 round-pixel 원칙을 지킨다. UI 텍스트는 고DPI에서도 선명하되 texture resolution 상한 4를 지킨다.

## 13. 언어와 접근성

### 13.1 한영/i18n

1. 지원 언어는 한국어(`ko`)와 영어(`en`)이며 최초 기본은 한국어다. 고유명 `Wirework`는 양 언어에서 유지한다.
2. 사용자 노출 문자열은 중앙 키 테이블을 통해 렌더하고 코드에 하드코딩하지 않는다. 모든 키는 ko/en 비어 있지 않아야 한다.
3. 선택 언어 값이 없을 때만 영어 fallback을 허용한다. placeholder 누락은 개발·테스트에서 실패해야 한다.
4. 저장 언어는 Preload 이전에 적용해 잘못된 언어 flash를 막는다. DOM `<html lang>`과 접근성 레이어도 즉시 동기화한다.
5. 버튼, HUD, GameOver, 포기 확인, 접근성 설정, 오류 메시지는 두 언어에서 잘리지 않아야 한다.

### 13.2 접근성 목표

1. `reduced motion`은 `system/on/off`를 지원한다. on이면 parallax, 무한 부유, 카메라 shake, 반복 blink/pulse, 큰 scale tween을 끄고 전환을 80ms 이하로 줄인다. hit-stop과 판정 시간은 유지해 난이도를 바꾸지 않는다.
2. 색각 모드는 default, deuteranopia, protanopia, tritanopia, high-contrast를 제공한다. 약점, 벽 상태, 위험, 버튼 focus는 색상 외 형태를 반드시 가진다.
3. 메뉴와 Settings는 Tab/방향키로 이동, Enter/Space로 실행, Esc로 뒤로가기, 가시적 focus ring을 지원한다. 볼륨·deadzone slider는 키보드로 조절 가능해야 한다.
4. 메뉴·설정·결과는 DOM 접근성 미러 또는 동등한 구조로 name/role/state를 노출해야 한다. 게임플레이 캔버스의 전체 공간 정보를 스크린리더로 재현할 의무는 없다.
5. 브라우저 확대를 금지해서는 안 되며 200% 확대에서 메뉴·설정이 조작 가능해야 한다.
6. 키 리바인드, 게임패드, reduced motion, 색각 설정은 로컬에 저장한다.

## 14. Viewport, resize, DPR, 성능

1. 권위 디자인 band는 960×540(16:9)이고 물리 arena는 1280×1280이다. HUD와 메뉴 필수 요소는 항상 960×540 safe band 안에 둔다.
2. canvas는 종횡비를 보존해 가용 창을 채우고, 여분 영역에는 월드/배경을 확장하되 필수 UI를 늘려 배치하지 않는다.
3. resize와 orientationchange는 페이지 재로드 없이 다음 animation frame에서 surface, camera zoom/scroll, pointer-to-world 변환, HUD anchoring을 다시 계산한다.
4. camera는 arena 밖을 보이지 않고 영웅을 추적하며 중심 방어 목표가 읽히도록 center bias 0.4, 최대 190px를 적용한다.
5. effective DPR은 최대 2, canvas backbuffer는 최대 4,000,000 pixels다. UI text resolution은 최대 4다.
6. 960×540 DPR1 및 1920×1080 DPR2의 지원 데스크톱에서 웨이브 8 최악 장면 p95 frame time 16.7ms 이하를 목표로 하고 33.3ms를 1초 이상 지속해서는 안 된다.
7. 10분 런에서 활성 객체·listener·timer 수가 웨이브 종료 후 기준치로 돌아와야 하고, 재시도 10회 후 지속 heap 증가가 있어서는 안 된다.
8. resize 20회 후 중복 listener, dead margin, HUD 이탈, pointer 조준 오차 1 design px 초과가 없어야 한다.
9. 빌드는 `/open-games/wirework/` base path에서 모든 asset을 로드하고 production sourcemap을 배포하지 않는다.

## 15. 저장, 결정론, 기술 경계

### 15.1 Settings와 기록 저장

1. Settings는 versioned schema `wirework:settings:v2`, 기록은 `wirework:records:v1`로 분리한다.
2. Settings는 master/SFX/music, difficulty, language, reducedMotion, colorMode, bindings, gamepadDeadzone을 저장한다.
3. 음량·언어·접근성·바인딩은 즉시 적용한다. 난이도는 현재 런 snapshot을 바꾸지 않는다.
4. load는 JSON root와 각 필드를 독립 검증한다. 유효 필드는 보존하고 잘못된 필드만 기본값으로 복구한다. 알 수 없는 필드는 무시한다.
5. malformed JSON, `null`, 배열, 타입 오류, 범위 밖 수치, 구버전은 crash 없이 기본값/마이그레이션으로 복구하고 정상화된 값을 다시 저장한다.
6. `localStorage` 읽기·쓰기·quota·private-mode 실패는 게임 시작, 결과, 재시도를 막아서는 안 된다. 메모리 설정과 이번 런 결과는 유지하고 비차단 “로컬 저장 불가” 상태를 표시한다.
7. 기록 수치는 음수가 아닌 safe integer여야 한다. 손상된 한 난이도 기록이 다른 난이도 기록을 지워서는 안 된다.
8. 런 상태, seed 기반 replay, 개인정보, 네트워크 식별자는 저장하지 않는다. `endedAt`은 로컬 기록 정렬용 ISO timestamp만 허용한다.

### 15.2 결정론

1. 새 런은 32-bit seed를 만들고 GameOver 데이터에 보존한다. 같은 난이도·seed·입력 이벤트·고정 timestep이면 스폰 역할/시각/위치, AI 확률, 시민 배치·배회가 동일해야 한다.
2. gameplay 코드는 `Math.random()`이나 프레임워크 전역 random을 직접 사용해서는 안 되고 주입된 seeded RNG만 사용한다.
3. simulation은 고정 60Hz step과 누적 delta를 사용하며 렌더링은 보간할 수 있다. Pause 동안 step을 누적해서는 안 된다.
4. 브라우저·부동소수점 차이까지 동일한 완전 replay는 보장하지 않는다. seed는 버그 재현용이며 온라인 경쟁 증명 수단이 아니다.

### 15.3 기술·config 경계

1. TypeScript strict를 유지하고 `any` 우회는 금지한다. Phaser scene은 조립과 수명주기를, 순수 system은 규칙과 계산을 담당해야 한다.
2. 모든 플레이 결과 수치—이동, 공격, 시민, AI, 스폰, 점수, 타이머, viewport 예산—는 `src/config/*.ts`에 한 번만 정의한다. scene/entity/system의 magic number는 금지한다.
3. 이동/와이어 기동의 유일한 source는 PlayerConfig여야 한다. GameConfig의 중복 legacy 이동·점프·tether 수치는 제거하고 탑다운 제품에 jump를 두지 않는다.
4. EnemyConfig는 고정 role stat, WaveConfig는 구성·페이싱만 소유한다. 난이도 코드가 EnemyConfig 값을 변형해서는 안 된다.
5. AudioManager는 오디오 재생을 담당하고 저장 serialization은 별도 Settings/Records repository가 담당해야 한다.
6. asset 출력 PNG/WAV를 직접 수정하지 않고 `tools/` 생성기와 provenance를 수정한다.
7. 제출 전 package `typecheck`, `test`, `build`와 repo 요구 검사를 모두 통과해야 한다.

## 16. 수용 기준

다음은 1.0 출시를 위한 MUST acceptance suite다.

1. **Flow E2E:** Title 출격, P Pause, Settings 왕복, 재개, Esc 포기 취소/확인, 4개 패배 이유, 승리, Retry, Title 복귀가 중복 scene 없이 동작한다.
2. **정확한 웨이브:** 8개 표, 69/85 총수, round-robin, 세 난이도 배율·하한, ±35% seeded jitter, 마지막 spawn 후 즉시 clearing을 자동 검증한다.
3. **방벽 침투:** 한 외벽 구간 breach만으로 같은 각도 내벽에 진입하고, 한 내벽 틈으로 시민 공격이 가능하며, 외벽 전멸만으로 패배하지 않고 내벽 전멸은 패배한다.
4. **전투 geometry 행렬:** 영웅 24×32과 역할별 body AABB, node offset·8px 원, 48×44 oriented slash 경계 접촉, rear dot 경계, tether nearest 교차를 fixture로 검증한다. 이어 모든 role의 body/후방 냉각 노드 피해, 비-Bastion 후방 냉각 노드 즉사, Rammer 즉사, Bastion 정면 3/후방 34/후방 냉각 노드 102 및 풀 HP 2회, cue와 실제 판정 일치를 검증한다.
5. **영웅 피해:** HP 100, 동일 tick 중복 방지, 800ms i-frame 경계, 240px/s knockback, melee impact 시 거리 재검사, Bombard 12를 검증한다.
6. **charge:** 비용 8/14s/4s/18, 부족 시 원자적 실패, 부분 drain, 350ms 지연, 55/26 회복, 0~100 clamp와 새 웨이브 미충전을 검증한다.
7. **AI:** sector 목표 순서, 역할별 영웅 전환 확률의 seeded 결과, commitment, 주민 공격 1명/공격, Rammer 우선순위, Bombard 420/540 및 직선 투사체를 검증한다.
8. **점수/기록:** role별 단일 지급, theoretical max 10,120/11,720, 난이도 분리, tie-break, 패배/포기 기록, write 실패 non-fatal을 검증한다.
9. **Pause:** 물리·AI·웨이브·투사체·charge·active timer가 정지하고 hidden/blur에서 자동 Pause되며 복귀 후 stuck input이 없음을 브라우저 테스트한다.
10. **입력:** keyboard/mouse 기본값, rebind 충돌·복원, canvas 범위 기본동작 억제, 게임패드 mapping/hot swap을 검증한다. touch는 지원된다는 UI를 보여서는 안 된다.
11. **저장 손상:** missing/partial/malformed/null/array/wrong type/out-of-range/old version/get-set throw/quota를 표 기반 테스트하고 field-level 복구를 검증한다.
12. **i18n/a11y:** 모든 키 ko/en parity, placeholder, DOM lang, 한국어·영어 overflow, keyboard-only 메뉴, 200% zoom, reduced-motion, 5개 색각 모드의 비색상 cue를 검증한다.
13. **Viewport/perf:** 명시한 창·DPR, resize 20회, pointer 오차, backbuffer 4M, text resolution 4, 웨이브 8 frame/heap 기준을 실제 브라우저에서 검증한다.
14. **결정론:** 같은 seed+입력은 동일 결과, 다른 seed는 다른 spawn sequence를 만들고 직접 random 호출이 정적 검사에서 실패해야 한다.
15. unit test는 순수 규칙을, browser integration은 Phaser scene/input/storage/resize/audio unlock을, 수동 플레이테스트는 조작감·가독성·오디오 믹스를 맡는다. 어느 한 층으로 다른 층을 대체해서는 안 된다.

## 17. 구현 현황 및 목표 대비 갭

이 절은 우선순위 계획용 기준선이며 앞 절의 요구사항을 약화하지 않는다.

| 영역 | 현재 상태 | 1.0 갭 |
|---|---|---|
| 핵심 scene | Boot/Preload/Title/Settings/Game/Pause/GameOver 존재 | 포기 확인, Pause→GameOver 일관 경로, 활성 타이머·정확한 완료 웨이브 필요 |
| 웨이브 | 8웨이브, 3난이도, round-robin, jitter 구현 | 실제 표/총합 테스트, 마지막 spawn 후 숨은 지연 제거, seeded RNG 필요 |
| 벽/시민 | 24×60, 16×80, 시민 12 구현 | 현재 전역 외벽 전멸→내벽 전환을 sector-local 침투로 교체; 시민 전멸 경로 보장 |
| 이동/charge | 8방향, dash, tether, reel, charge 핵심 구현 | release fling 끼임, 입력 action map, config 중복·magic number 제거 |
| 후방 냉각 노드/combat | 배율 critical, Bastion 정면 저항, cue 구현 | 비-Bastion 즉사 규칙, Rammer 처리, cue/hit 공유 geometry, impact 시점 판정 필요 |
| AI/Bombard | 6역할, 영웅 diversion, 투사체 구현 | sector 경로, 공격 선행 cue, 주민 공격 도달성, 사용되지 않는 projectile gravity 제거 |
| 승패/점수 | 승리와 4패배 이유, kill 점수 구현 | 외벽 비패배 회귀, 동시 판정 우선순위, 난이도별 최고기록 필요 |
| 저장 | `wirework:settings:v1`와 기본 corruption fallback | 저장소 분리, v2 migration, field-level 복구, records v1, 실패 UI·테스트 필요 |
| 원본 세계관 | 현재 README/game.json/config/assets/generator에 생물형 적·기존 기동/약점 용어와 인간형 실루엣이 남아 있음 | 공개 문구를 아크 수호자·침입 기계·전하·후방 냉각 노드로 교체하고, 적 sprite를 비인간 공성기계, 혈액/증기를 스파크/냉각수로 재생성하며 CREDITS를 갱신해야 함 |
| i18n | ko/en 키, fallback, placeholder 테스트 | DOM lang, 전체 UI overflow, 접근성 레이어, `titleKo` 일관성 필요 |
| 접근성 | 텍스트 HUD와 일부 단축키 | reduced motion, 색각 모드, rebind, 키보드 메뉴, focus, zoom, 게임패드 필요 |
| touch | 제한적 drag/tap 코드 존재 | 공식 비지원에 맞춰 오해 소지 제거; 불완전 touch를 기능으로 노출 금지 |
| viewport | 960×540 band, 1280 arena, resize, DPR≤2 기반 존재 | 실제 4M backbuffer 적용, text DPR 상한, 브라우저 회귀·성능 테스트 필요 |
| 결정론 | wave 데이터·일부 순수 함수만 결정적 | seeded RNG 통합, fixed step, 직접 random 제거 필요 |
| 테스트 | Difficulty/Enemy/Wave/Gas/Siege/i18n/GameOverReason의 Node unit test 존재 | scene·storage·score·combat·AI·pause·browser·a11y·perf coverage가 출시 차단 수준으로 부족 |

### 구현 우선순위

1. P0: sector-local 침투와 승패 도달성, 후방 냉각 노드/Bastion 규칙, 포기 확인, pause timer, 정확한 wave completion.
2. P0: seeded RNG·고정 step, 점수/records 저장, corruption-safe 저장소, 핵심 규칙 자동 테스트.
3. P1: action input/rebind/gamepad, keyboard menu/focus, reduced motion·색각·비색상 cue.
4. P1: viewport/backbuffer/text DPR 강제, browser E2E, 웨이브 8 성능·재시도 leak 기준.
5. P2: 감각 조정, 오디오 믹스, 한국어·영어 레이아웃 polish. P2는 P0/P1 수용 기준을 우회할 수 없다.
