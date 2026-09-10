# 서리성채: 마지막 불씨 — 목표 제품 스펙

- 문서 상태: **권위 있는 목표 제품 계약**
- 제품명: **서리성채: 마지막 불씨 / Frosthold: Last Ember**
- 배포 식별자: `whiteout` (브랜드명이 아님)
- 기준 저장 형식: **v8**
- 기준 논리 해상도: **960×540**

## 1. 문서 권위와 규범

이 문서는 README, handoff, `game.json`, `package.json`, `src/config`, `src/systems`, `src/scenes` 및 테스트에서 확인한 의도와 동작을 바탕으로 팀이 구현·리뷰·QA해야 할 **목표 제품**을 정의한다. 현재 코드의 단순 설명서가 아니다.

- **MUST / 반드시**: 출시 가능한 빌드가 충족해야 하는 요구사항이다.
- **MUST NOT / 금지**: 제품 경계를 지키기 위해 허용되지 않는다.
- **SHOULD / 권장**: 특별한 사유가 없다면 충족해야 하며, 예외는 PR에 근거와 대안을 기록한다.
- **MAY / 선택**: 다른 요구사항을 훼손하지 않는 범위에서 구현할 수 있다.
- 본 문서와 README, handoff, 주석, 화면 문구가 충돌하면 **본 문서가 우선**한다.
- 밸런스 수치의 실행 가능한 원천은 `src/config`여야 하며, 수치를 바꿀 때 본 문서와 테스트도 같은 변경에서 갱신해야 한다.
- “현재 구현 현황/갭”은 진척도 기록일 뿐 목표 요구사항을 낮추지 않는다.

## 2. 제품 정의

### 2.1 비전

플레이어는 끝나지 않는 겨울 속 마지막 성채의 지휘관이다. 중앙 **Furnace(화로)**의 불씨를 연료로 지키고, 생존자를 수용·배치하며, 제한된 자원을 도시·영웅·연구·군대에 분배해 서리 군단을 막아낸다. 핵심 감정은 “꺼져 가는 불씨를 오늘도 지켜 냈다”는 안도와, 다음 성장을 스스로 설계했다는 통제감이다.

### 2.2 타깃과 플랫폼

- 타깃은 복잡한 조작보다 짧은 계획·회수·성장을 선호하는 캐주얼~미드코어 전략/방치형 플레이어다.
- 플랫폼은 최신 데스크톱·모바일 브라우저의 정적 웹 배포다. 설치, 계정, 서버 연결 없이 플레이 가능해야 한다.
- 한국어를 제품의 기준 언어로 하고 영어를 동등하게 지원한다.
- 1회 능동 세션은 약 **5~15분**, 재방문 간격은 수십 분~8시간을 목표로 한다. 첫 세션은 10분 안에 생산, Warmth, 첫 훈련, 첫 전투를 이해시켜야 한다.

### 2.3 생존 판타지

- 화로는 단순 장식이나 체력바가 아니라 도시 전체 경제를 압박하는 중심 시스템이어야 한다.
- 목재와 석탄의 생산·비축·연소 사이에 항상 의미 있는 긴장이 있어야 한다.
- 실패는 성채 삭제가 아니라 병력·시간·기회비용의 손실이어야 하며, 재건 가능해야 한다.
- 오프라인 진행은 보상이면서 동시에 연료 소모와 추위가 반영되는 정직한 정산이어야 한다.

### 2.4 제품 원칙

1. **불씨가 모든 선택을 잇는다.** 경제, 인구, 건물, 전투 준비는 Warmth와 자원 기회비용으로 연결한다.
2. **규칙은 예측 가능하다.** 비용, 게이트, 천장, 상성, 승패 조건과 보상 횟수를 행동 전에 보여 준다.
3. **싱글플레이를 숨기지 않는다.** Alliance, Arena, Rally는 NPC 시뮬레이션임을 명확히 표기한다.
4. **결제 없이 완결된다.** Ember Sparks와 VIP는 플레이로만 획득하는 소프트 진행이며 구매 유도 UI를 두지 않는다.
5. **방치 결과는 설명 가능하다.** 활성/오프라인은 같은 공식과 경계 순서를 쓰며, 14.2에 명시한 50% 적용 대상만 의도적으로 달라야 한다.
6. **원본 IP를 지킨다.** 이름, 설정, 코드 식별자, 아트, 오디오, 문서 어디에도 제3자 게임 IP를 사용하지 않는다.
7. **화면은 상태를 설명한다.** 숫자 변화에는 원인, 비용, 성공·실패 피드백이 따른다.

### 2.5 비목표

- 실시간 또는 비동기 온라인 멀티플레이, 계정, 채팅, 길드 서버, 리더보드는 지원하지 않는다.
- 실제 플레이어 간 PvP는 지원하지 않는다. Arena는 seeded NPC 전투다.
- IAP, 현금 결제, 광고, 유료 재화, 확률형 상품 판매는 지원하지 않는다.
- 도시 자유 배치, 복잡한 전술 이동, 실시간 유닛 직접 조종은 목표가 아니다.
- Warmth 0, 일반 전투 패배, 오프라인 연료 고갈만으로 영구 게임 오버가 발생해서는 안 된다.
- 워크스페이스명 `whiteout`을 게임 내 브랜드나 세계관 용어로 노출하지 않는다.

## 3. 전체 플레이 흐름과 내비게이션

### 3.1 정식 흐름

`Boot → Preload → Title → Town → (Command 또는 Battle) → 결과/보상 → Town`

1. **Boot/Preload**: 저장 언어와 설정을 먼저 복원하고 필수 폰트·에셋을 로드한다. 실패 시 정지하지 말고 원인과 재시도 수단을 제공한다.
2. **Title**: 신규 저장이면 Play와 Settings, 기존 저장이면 Continue, New Hold, Settings를 표시한다. New Hold는 2단계 확인 뒤에만 기존 진행을 지운다.
3. **Town**: 자원·Warmth·인구·건물·훈련을 관리하는 주 허브다. 모든 핵심 루프와 Command 및 Battle 진입점이 한 화면에서 발견 가능해야 한다.
4. **Command**: `Hero / Summon / Campaign / Research / Gear / Alliance / Arena / Quests`의 8개 목적지를 제공한다.
5. **Hero**: 12영웅 열람, 조각 제작, 훈련, 승급, 스킬, 3인 Lead 편성을 담당하며 Summon으로 직접 이동할 수 있다.
6. **Summon**: 비용, 확률 가중치, pity 잔여 횟수, 중복 보상을 행동 전에 표시한다.
7. **Campaign**: 일반 웨이브와 독립된 단계형 원정과 최초 클리어 보상을 제공한다.
8. **Research**: 4분기 16노드, 선행 조건, Ember Archive 게이트, 비용·시간, 보너스를 표시한다.
9. **Gear**: 6부위 장비와 charm 소켓을 관리한다.
10. **Alliance**: NPC 협정, 도움, 기술 기여와 **Rally** 진입을 제공한다.
11. **Arena**: seeded NPC 상대, 예상 전투력, 현재 등급, 승패·보상을 제공한다.
12. **Quests**: Daily, Growth, Event, VIP를 탭 또는 명확한 섹션으로 통합한다.
13. **Battle**: Town의 일반 20웨이브 전투다. Campaign/Rally와 진행·체력·보상 상태를 공유하지 않는다.
14. **Result**: 승패, 보상, 사상자, 생존자, 다음 행동을 보여 주고 Town으로 복귀시킨다.
15. 모든 Command 하위 화면은 Back 및 `Esc`로 Town에 돌아가며 이탈 직전에 즉시 저장한다.
16. Settings는 Title과 Town 양쪽에서 열 수 있고 진입 전 화면으로 돌아간다.

### 3.2 시간 진행 정책

- 시뮬레이션은 Town에 있을 때만 흐르는 것이 아니라 앱이 활성화된 모든 씬에서 동일한 전역 시계를 사용해야 한다.
- 화면 전환은 생산, Warmth, 건설, 연구, 훈련, Alliance 도움 생성 시간을 멈추거나 중복 적용해서는 안 된다.
- 프레임 지연은 누적 시간 기반 또는 고정 스텝으로 보정하고, 한 프레임의 중복 지급을 금지한다.

## 4. 경제와 자원

### 4.1 자원 계층

| 자원 | 획득/변환 | 핵심 용도 |
|---|---|---|
| food / 식량 | Hunters' Hut, 보상 | 건물, 병력, 생존 유지 투자 |
| wood / 목재 | Sawmill, 보상 | 건설, 병력, **Furnace 연료** |
| coal / 석탄 | Coal Pit, 보상 | 건설, 정련, **Furnace 연료** |
| iron / 철 | Iron Mine, 보상 | 고급 건물, 장비, 병력, 정련 |
| refined steel / 정련 강철 | Forge Hall이 철 2+석탄 1을 강철 1로 변환 | 중후반 건물·장비·등급 투자 |
| Ember Sparks / 불씨 정수 | 켜진 화로의 느린 생성, 콘텐츠 보상 | 영웅 소환·훈련 전용 소프트 재화 |

- 신규 성채는 food 200, wood 200, coal 100, iron 50, refined steel 0, Ember Sparks 0, 생존자 4, Furnace L1, Warmth 100으로 시작한다.
- 기본 생산량은 Hunters' Hut 2.0 food/s, Sawmill 1.6 wood/s, Coal Pit 1.0 coal/s, Iron Mine 0.5 iron/s다.
- 생산 건물 L1 초과 산출은 `기본 산출×1.35^(레벨-1)`을 따른다.
- Forge Hall L1 처리량은 0.15 steel/s이며 같은 1.35 성장률을 따른다.
- 정련은 한 계산 구간에서 필요한 iron과 coal이 모두 있을 때만 가능한 양을 **원자적으로** 소비한다. 일부 입력만 먼저 빼서는 안 된다.
- 자원 잔액은 정상 플레이로 음수가 되어서는 안 되며, 비용은 행동 확정 시 선납한다.
- HUD의 `/초`는 단순 건물 원시값이 아니라 Warmth, 인구, 연구, 장비, 영웅, Alliance, 이벤트, VIP를 적용한 **실효 순변화량**을 표시해야 한다. 상세 보기에는 각 배율과 연료·정련 소비를 분해한다.
- 활성·오프라인 경제는 모두 건설/연구/훈련 deadline, UTC Event 전환, 자원 고갈 시각에서 구간을 나누고 각 경계에서 `도달한 타이머 완료 → Warmth 연료 원자 소비 → Warmth 변화 → 인구 성장 → passive 생산 → 정련 → Sparks` 순으로 처리한다. 활성 source-rate multiplier는 1.0, 오프라인은 14.2에서 지정한 항목에만 0.5다. 구간 중 연료나 정련 입력이 먼저 고갈되면 그 시각을 새 경계로 만들어 이후 상태를 다시 계산한다.

### 4.2 Warmth: 패배 조건이 아닌 경제 압박

- Warmth는 도시 체력이 아니며 **0이어도 즉시 패배하거나 저장이 초기화되지 않는다**.
- Furnace L1의 최대 Warmth는 100이고, 레벨마다 +20이다.
- L1 연료 수요는 초당 wood 0.6과 coal 0.4다. Furnace 레벨당 5% 감소하되 기본의 40% 아래로 내려가지 않는다.
- 매 시뮬레이션 구간에 wood와 coal의 전체 수요를 모두 낼 수 있을 때만 두 자원을 함께 소비한다. 하나라도 부족하면 둘 다 소비하지 않는 **원자 소비**를 적용한다.
- 연료 충족 시 Warmth는 +8/s, 미충족 시 -5/s이며 `[0, 현재 최대치]`로 제한한다.
- Warmth 생산 계수는 비율에 따라 선형으로 변하고, 최대에서 100%, **0에서 정확히 25%**다.
- 이 25%는 Warmth 자체가 가하는 하한이다. 인력 부족 등 독립적인 계수는 추가 적용될 수 있으나, 만족도에서 Warmth를 다시 생산 패널티로 곱해 같은 추위를 이중 과세해서는 안 된다.
- Ember Sparks는 Furnace L1 이상일 때 0.005/s 생성한다. 목표 제품에서 “켜짐”은 Furnace가 존재하고 연료를 실제 소비할 수 있는 상태로 정의하며, 무연료 상태에서는 생성하지 않는다.
- Warmth가 35% 이하이면 HUD·도시 색조·안내가 연료 부족 원인과 예상 실효 생산을 경고해야 한다.

## 5. 도시, 건물, 인구

### 5.1 건물 공통 규칙

- 건물 최대 레벨은 20이다. L0은 미건설, L1 이상은 건설 완료 상태다.
- 업그레이드 비용은 `ceil(기본 비용×1.6^현재 레벨)`, 시간은 `목표 레벨×5초`를 기준으로 한다.
- 비용은 시작 시 선납하고 완료 시 한 레벨만 오른다. 같은 건물의 동시 업그레이드는 금지한다.
- Furnace가 모든 비-Furnace 건물을 게이트한다. 각 건물의 최소 Furnace 선행 레벨을 충족해야 하며, 비-Furnace 건물 레벨은 Furnace 레벨을 초과할 수 없다.
- 잠긴 건물은 “잠김”만 표시하지 말고 필요한 Furnace 레벨과 기타 선행조건을 보여 준다.

| 건물 | L1 기본 비용 | 최소 Furnace | 생산/목표 역할 |
|---|---|---:|---|
| Furnace | wood100, coal60 | 0 | Warmth 최대치·연료 효율·도시 레벨 상한 |
| Hunters' Hut | wood40, food20 | 1 | food 2.0/s |
| Sawmill | food40, coal20 | 1 | wood 1.6/s |
| Shelter Row | wood120, food80 | 1 | 주거 +6/레벨 |
| Coal Pit | wood80, food40 | 2 | coal 1.0/s |
| War Camp | wood150, coal100 | 2 | 공통 훈련 대기열 해금 |
| Frost Vault | wood140, iron40 | 2 | L1 15%, 이후 +5%p/레벨, 최대 75% 재고 보호 |
| Envoy Hall | wood160, food120 | 2 | Alliance/Rally 해금 |
| Warming Ward | food160, coal80 | 2 | Ember Sparks 영웅 훈련 해금 |
| Infantry Yard | wood180, iron60 | 2 | Vanguard/보병 훈련 해금 |
| Iron Mine | wood120, coal80 | 3 | iron 0.5/s |
| Forge Hall | iron120, coal120 | 3 | steel 0.15/s, steel 1당 iron2+coal1 |
| Ember Archive | wood200, iron80 | 3 | Research 해금 및 노드 레벨 게이트 |
| Lancer Yard | wood180, iron80 | 3 | Trapper/창병 훈련 해금 |
| Marksman Range | wood200, iron100 | 4 | Marksman/사수 훈련 해금 |

- Frost Vault의 목표 보호율은 L1 15%, 레벨당 +5%p, 최대 75%다. 현재 제품에 재고 손실 원천이 없다면 건설 목록에서 “향후 기능”으로 비활성화하거나 보호 수치를 숨겨야 하며, 가짜 효용을 판매해서는 안 된다.
- `buildSpeed`는 완료된 연구, emblem 장비, VIP의 적용 가능한 build-speed 소수 보너스를 가산한 `max(0,Σbonus)`다. 건설·연구 시작 시 `effectiveDurationMs=max(1000,ceil(baseDurationMs/(1+buildSpeed)))`를 계산해 절대 deadline으로 스냅샷한다. 이후 보너스 변동은 진행 중 타이머를 소급 재계산하지 않으며 Alliance 도움의 최대 60초 감소는 저장된 deadline에서 별도로 뺀다. buildSpeed는 병력 훈련 시간에는 적용하지 않는다.

### 5.2 인구, 배치, 만족도

- 주거 상한은 `8 + Shelter Row 레벨 합×6`이다.
- 생존자는 상한까지 0.02명/s로 증가하고 소수 carry를 보존한다. Recruit은 빈 주거 내에서 3명씩 즉시 추가한다.
- 생산 건물 레벨당 희망 인력은 1명이다. 배치는 건물별로 저장하며 해당 건물 산출에만 영향을 준다.
- 한 건물의 유효 배치는 그 건물 레벨을 초과할 수 없고, 총 배치 수는 총 생존자를 초과할 수 없다.
- 생산 건물 `b`의 staffing 계수는 `staffing_b=0.35+0.65×clamp(assigned_b/max(1,level_b),0,1)`이다.
- `occupancy=clamp(survivors/housingCapacity,0,2)`이고 `housingScore=clamp(100-100×max(0,(occupancy-0.75)/0.25),0,100)`이다. 75% 이하 점유는 100, 정상 상한인 100% 점유는 0이며 손상 저장의 과밀도 0으로 제한한다.
- 표시 만족도는 `round(0.7×housingScore+0.3×100×Warmth/maxWarmth)`의 0~100 값이다. 생산용 만족도 계수는 **난방을 다시 포함하지 않는** `satisfactionProduction=0.5+0.5×housingScore/100`이므로 정확히 50~100%다. 만족도, staffing, Warmth는 HUD 상세에서 별도 항목으로 표시한다.
- 자원 `r`에 적용되는 `economyBonus_r`는 연구·장비·economy Lead·Alliance·VIP 중 전체 경제 또는 해당 자원을 명시한 소수 보너스의 합이다. 하나의 보너스를 전체/자원 양쪽에 중복 합산하지 않는다. Event multiplier는 현재 UTC day에 따라 1.5 또는 1.25다.
- 생산 건물의 최종 passive rate는 `rawRate_b×staffing_b×warmthFactor×satisfactionProduction×max(0,1+economyBonus_r)×eventMultiplier×sourceMultiplier`다. `warmthFactor=0.25+0.75×Warmth/maxWarmth`, 활성 `sourceMultiplier=1`, 오프라인은 14.2에 따라 0.5다.
- Forge Hall의 정련 capacity도 위 식에서 `rawRate_b=0.15×1.35^(level-1)`, `r=steel`로 계산하고 실제 steel은 capacity와 iron/coal 원자 입력 중 작은 양만 만든다. 인구 증가와 Sparks는 이 economy/staffing/satisfaction/Event 식을 사용하지 않고 각각 0.02명/s와 4.2의 0.005/s에 source multiplier만 적용한다.
- Population 패널은 건물별 `+/-`, Recruit, Recall All, 배치/총원/주거를 제공한다.

## 6. 영웅과 소환

### 6.1 로스터와 성장

- 영웅은 정확히 12명이며 common/rare/epic/legendary 각 3명, infantry/lancer/marksman 각 병과를 모든 희귀도에 하나씩 둔다.

| 영웅 | 희귀도/병과/역할 | basePower | L1·1★ 보너스 | 스킬 magnitude/레벨 |
|---|---|---:|---:|---|
| Ember Warden | common/infantry/army | 100 | 3% | 2% |
| Snow Picket | common/marksman/economy | 100 | 3% | 2% |
| Drift Runner | common/lancer/army | 100 | 3% | 2% |
| Iron Bulwark | rare/infantry/army | 160 | 5% | 3%,2% |
| Glacier Lance | rare/lancer/army | 160 | 5% | 3%,2% |
| Frost Archer | rare/marksman/economy | 160 | 5% | 3%,2% |
| Aurora Sentinel | epic/infantry/army | 240 | 8% | 4%,3%,2% |
| Stormpike Rider | epic/lancer/army | 240 | 8% | 4%,3%,2% |
| Winter’s Eye | epic/marksman/economy | 240 | 8% | 4%,3%,2% |
| The Kindled Queen | legendary/infantry/army | 360 | 12% | 5%,4%,3% |
| Wyrmspear Valdis | legendary/lancer/army | 360 | 12% | 5%,4%,3% |
| The Pale Marksman | legendary/marksman/economy | 360 | 12% | 5%,4%,3% |

- 영웅 전투력은 `basePower×[1+0.06×(level-1)]×[1+0.25×(stars-1)]`이다. Lead 보너스는 `baseBonus×levelFactor×starFactor×[1+Σ(skillMagnitude×skillLevel)]`이며, `levelFactor=1+0.02×(level-1)`, `starFactor=1+0.15×(stars-1)`로 고정하고 같은 역할의 최대 3명을 합산한다.
- 성급 비용은 `round(10×1.8^현재성급×희귀도배율)`이고 희귀도배율은 common1/rare1.5/epic2/legendary3이다. 실행값은 common 18/32, rare 27/49/87, epic 36/65/117/210, legendary 54/97/175/315/567이다.
- 기본 전투력은 희귀도별 100/160/240/360, 최대 성급은 3/4/5/6이다.
- 첫 획득은 L1·1성이다. 레벨 상한은 성급당 10레벨, 전체 최대 60이다.
- 다음 레벨 XP는 `round(100×1.35^(현재 레벨-1))`이며, 성급 상승은 희귀도 배율과 조각 비용을 사용한다.
- 영웅 훈련 1회는 Warming Ward L1 이상에서만 가능하며 Ember Sparks 20을 원자적으로 선납하고 선택한 영웅의 누적 XP wallet에 300 XP를 더하며 VIP 포인트 20을 같은 트랜잭션에 지급한다. Sparks 부족, 미보유 영웅, 전체 L60이면 상태를 바꾸지 않는다. 현재 성급의 레벨 상한에서는 훈련할 수 있고 XP를 다음 성급을 위해 보존한다.
- 훈련 또는 성급 상승 후 현재 레벨의 요구 XP를 wallet에서 차감해 새 성급별 레벨 상한 또는 전체 L60에 닿을 때까지 반복 레벨업한다. 남은 XP는 영웅별로 보존하고 내부 XP·계수는 반올림하지 않으며 최종 UI 표시만 반올림한다.
- 미보유 영웅은 조각 common 10, rare 15, epic 20, legendary 30으로 제작 가능하다.
- 스킬 i는 i+1성에 해금되고, 해금 스킬 레벨은 현재 성급을 따른다.
- Lead 편성은 중복 없는 3개 명시 슬롯이다. 미보유 영웅은 배치할 수 없다.
- army Lead 보너스는 전투 공식에 정확히 한 번, economy Lead 보너스는 생산 공식에 정확히 한 번만 적용한다.

### 6.2 소환 정책

- 단일 소환 비용은 **100 Ember Sparks**다. 10연차와 유료 티켓은 이 범위의 필수 기능이 아니다.
- 희귀도 가중치는 common 60, rare 28, epic 10, legendary 2다.
- epic 이상이 아닌 결과가 20회 연속 발생하면 **다음 1회**는 epic 이상을 보장한다. epic 이상 획득 시 카운터를 0으로 초기화한다.
- pity 강제 시 epic:legendary 상대 가중치 10:2를 유지한다.
- 중복 획득은 common 4, rare 6, epic 10, legendary 20조각으로 변환한다.
- 소환 RNG는 저장에 seed/state를 보존하는 결정론적 PRNG여야 한다. 동일한 저장 상태와 입력 순서는 동일한 결과를 내야 하며 재로드로 결과를 바꿀 수 없어야 한다.
- 소환 화면은 비용, 현재 Sparks, pity까지 남은 횟수, 결과 희귀도, 신규/중복, 획득 조각을 즉시 피드백한다.

## 7. 연구, 장비, charm, 병력

### 7.1 연구

- 연구는 경제 4, 전투 5, 생존 3, 발전 4의 **총 16노드**다.

| ID/분기 | 비용 | 시간 | 선행/Archive | 효과 |
|---|---|---:|---|---|
| eco_foraging/경제 | food200 wood200 | 2m | —/L1 | food +10% |
| eco_logistics/경제 | wood400 coal200 | 4m | eco_foraging/L2 | 전체 경제 +8% |
| eco_metallurgy/경제 | iron400 coal400 steel40 | 8m | eco_logistics/L4 | iron·steel +15% |
| eco_efficient_works/경제 | wood600 iron200 | 6m | eco_logistics/L3 | 건설속도 +12% |
| bat_drill/전투 | food250 iron150 | 3m | —/L1 | 병력공격 +8% |
| bat_armor/전투 | iron400 coal200 | 5m | bat_drill/L2 | 병력HP +10%, 방어 +6% |
| bat_infantry_doctrine/전투 | iron500 steel60 | 8m | bat_armor/L4 | infantry +15% |
| bat_lancer_doctrine/전투 | iron500 steel60 | 8m | bat_armor/L4 | lancer +15% |
| bat_marksman_doctrine/전투 | wood400 steel60 | 8m | bat_armor/L4 | marksman +15% |
| sur_insulation/생존 | wood300 coal150 | 3m | —/L1 | coal +12% |
| sur_provisioning/생존 | food500 wood300 | 6m | sur_insulation/L3 | food +15%, 경제 +5% |
| sur_hardened_frame/생존 | iron300 steel30 | 6m | sur_insulation/L3 | 병력HP +12% |
| dev_ironworking/발전 | iron300 coal200 | 4m | —/L2 | T2 해금 |
| dev_steel_tactics/발전 | iron600 steel80 | 8m | dev_ironworking/L4 | T3 해금 |
| dev_master_forge/발전 | iron1000 steel200 | 12m | dev_steel_tactics/L6 | T4 해금 |
| dev_wide_streets/발전 | wood500 coal300 | 6m | dev_ironworking/L3 | 건설속도 +10% |
- 연구는 동시에 하나만 진행한다. 비용은 시작 시 선납하고 선행노드와 Ember Archive 요구 레벨을 모두 검사한다.
- 지속시간은 노드별 2~12분이며 build speed 스냅샷을 적용한다.
- 경제·전투·생존 보너스와 발전 분기의 T2/T3/T4 해금은 실제 생산·전투·훈련에 연결되어야 한다.
- 완료 시간 경계는 활성/오프라인 시뮬레이션 모두 정확히 분할해 완료 전후 보너스를 소급하거나 누락하지 않는다.

### 7.2 장비와 charm

- 장비 부위는 coat, gloves, boots, belt, helm, emblem 6개이며 각 최대 L10이다.
- 각 부위는 charm 소켓 1개를 갖고 warfare, bulwark, harvest 중 하나를 장착하며 charm 최대 L5다.

| 종류 | ID | L0→1 비용 | 레벨당 효과 |
|---|---|---|---|
| gear | coat | iron120 steel20 | 병력HP +2%, 방어 +2% |
| gear | gloves | iron120 steel20 | 공격 +3% |
| gear | boots | iron100 steel15 | 방어 +2%, lancer +2% |
| gear | belt | iron100 steel15 | HP +3%, infantry +2% |
| gear | helm | iron140 steel25 | 공격 +2%, marksman +2% |
| gear | emblem | steel40 | 경제 +2%, 건설속도 +2% |
| charm | warfare | iron60 steel10 | 공격 +2% |
| charm | bulwark | iron60 steel10 | HP +2%, 방어 +1% |
| charm | harvest | steel20 | 경제 +1.5% |
- 장비의 각 자원 비용 성분은 `ceil(L0→1 기본 비용 성분×1.5^현재레벨)`, charm은 `ceil(L0→1 기본 비용 성분×1.6^현재레벨)`로 계산한다. 0인 비용 성분은 계속 0이며 각 성분을 독립적으로 올림한다.
- 보너스는 공유 modifier bundle에 가산한 뒤 자원별 생산·병과별 전투에 한 번만 적용한다.
- 장착 charm 교체는 확인 없이 기존 charm을 파괴해서는 안 된다. 목표 정책은 소켓한 종류를 유지해 업그레이드만 허용하며, 교체 기능을 추가할 경우 회수/손실 규칙을 사전 표시한다.

### 7.3 병력, 등급, 상성

- 병력은 Vanguard=infantry, Trapper=lancer, Marksman=marksman 세 병과다.

| 병과 | T1 HP/ATK/AS/SPD/RNG | 1명 비용 | 시간 |
|---|---:|---|---:|
| Trapper/lancer | 60/10/1.0/60/24 | food20 wood10 | 5s |
| Marksman | 40/14/1.2/55/140 | food15 wood25 | 7s |
| Vanguard/infantry | 140/22/0.8/70/28 | food40 iron20 | 12s |

- tier `t=1..4`에서 HP/ATK/AS는 `T1×1.4^(t-1)`, 비용 각 성분은 `ceil(T1×1.5^(t-1))`, 시간은 `T1×1.25^(t-1)`이며 SPD/RNG는 고정한다. 따라서 T4는 Trapper 164.64/27.44/2.744, Marksman 109.76/38.416/3.2928, Vanguard 384.16/60.368/2.1952다.
- 상성은 **infantry > marksman > lancer > infantry**다. 강상성 1.5, 약상성 0.75, 중립 1.0을 적용한다.
- T1은 기본 해금, T2~T4는 발전 연구로 순차 해금한다.
- 등급당 attack, HP, attack speed는 1.4배, 비용은 1.5배, 훈련시간은 1.25배다. 이동속도와 사거리는 유지한다.
- 훈련 대기열은 최대 6묶음, 묶음당 최대 20명이다. 비용은 등록 시 선납하고 순차 완료한다.
- War Camp와 해당 병과 Yard가 모두 있어야 훈련할 수 있다. 요청 등급은 연구 상한을 넘을 수 없다.
- 보유 병력과 대기열은 종류와 tier를 모두 보존해야 한다.

## 8. 전투 콘텐츠

### 8.1 일반 20웨이브

- 일반 전투는 Town 방어 진행이며 정확히 20웨이브다. 현재 최고 클리어+1만 도전한다.

적 단위 power는 `ATK×AS+HP×0.25`다: Frost Wolf(lancer) 50/9/1.0=21.5, Ravager(infantry) 130/18/0.7=45.1, Frost Titan(infantry) 260/30/0.5=80, Rime Alpha(lancer) 900/55/1.1=285.5, Glacier Behemoth(infantry) 2400/90/0.6=654다.

| W | 구성(Wolf/Ravager/Titan/Alpha/Behemoth) | 적 power | 최초 보상 food/wood/coal/iron |
|---:|---|---:|---:|
| 1 | 4/0/0/0/0 | 86.0 | 60/50/30/0 |
| 2 | 6/0/0/0/0 | 129.0 | 75/63/38/19 |
| 3 | 7/1/0/0/0 | 195.6 | 94/78/47/23 |
| 4 | 9/1/0/0/0 | 238.6 | 117/98/59/29 |
| 5 | 10/2/1/0/0 | 385.2 | 146/122/73/37 |
| 6 | 12/2/1/0/0 | 428.2 | 183/153/92/46 |
| 7 | 13/3/1/0/0 | 494.8 | 229/191/114/57 |
| 8 | 15/3/2/0/0 | 617.8 | 286/238/143/72 |
| 9 | 16/4/2/0/0 | 684.4 | 358/298/179/89 |
| 10 | 18/4/2/1/0 | 1012.9 | 447/373/224/112 |
| 11 | 19/5/3/1/0 | 1159.5 | 559/466/279/140 |
| 12 | 21/5/3/1/0 | 1202.5 | 698/582/349/175 |
| 13 | 22/6/3/1/0 | 1269.1 | 873/728/437/218 |
| 14 | 24/6/4/1/0 | 1392.1 | 1091/909/546/273 |
| 15 | 25/7/4/2/1 | 2398.2 | 1364/1137/682/341 |
| 16 | 27/7/4/2/1 | 2441.2 | 1705/1421/853/426 |
| 17 | 28/8/5/2/1 | 2587.8 | 2132/1776/1066/533 |
| 18 | 30/8/5/2/1 | 2630.8 | 2665/2220/1332/666 |
| 19 | 31/9/5/2/1 | 2697.4 | 3331/2776/1665/833 |
| 20 | 33/9/6/3/2 | 3759.9 | 4163/3469/2082/1041 |

- tier 적용 뒤 병력 단위 power는 `unitPower_{c,t}=ATK_{c,t}×AS_{c,t}+HP_{c,t}×0.25`다. 병과 `c`, tier `t`별 stack은 `stackPower_{c,t}=count_{c,t}×unitPower_{c,t}×globalMultiplier×classMultiplier_c×leadArmyMultiplier`이며 `classPower_c=Σ_t stackPower_{c,t}`다. `globalMultiplier=max(0,1+troopAttack+0.5×troopHp+0.5×troopDefense)`, `classMultiplier_c=max(0,1+classBonus_c)`, `leadArmyMultiplier=max(0,1+Lead army bonus)`이고 연구·장비·Alliance·영웅의 각 modifier를 해당 합에 정확히 한 번 넣는다.
- 적 상성 적용 전 공통 전투력 `campaignPower=Σ_c classPower_c`다. 일반 wave의 각 병과 상성 계수는 `counter_c=Σ_e(enemyPower_e×matchup(c,e))/Σ_e enemyPower_e`이고 matchup은 강 1.5/약 0.75/중립 1.0이다. 최종 `playerPower=Σ_c(classPower_c×counter_c)`이며 적이 없으면 전투를 시작하지 않는다.
- `playerPower>0`이고 적 power 이상이면 승리한다. 패배하면 모든 `count_{c,t}`가 0이 된다. 승리 시 병과별 총원 `N_c=Σ_t count_{c,t}`, 손실률 `lossRate=min(1,enemyPower/playerPower)`, 목표 생존자 `S_c=max(1,N_c-floor(N_c×lossRate))`다. 먼저 `survivors_{c,t}=floor(S_c×count_{c,t}/N_c)`를 배정하고 남은 `S_c-Σ_t survivors_{c,t}`명은 해당 tier 원래 인원을 넘지 않는 범위에서 높은 tier부터 각 1명씩 배정한다. 사상자는 `count_{c,t}-survivors_{c,t}`다.
- 적 구성은 웨이브와 함께 증가하고 3부터 Ravager, 5부터 Frost Titan, 10부터 Rime Alpha, 15부터 Glacier Behemoth를 포함한다.
- 승리 시 상성·전력비 기반 사상자를 적용하되 참가한 각 병종은 최소 1명이 생존할 수 있고, 해당 웨이브 자원 보상을 1회 지급하며 다음 웨이브를 연다.
- 패배 시 출전 병력은 전멸하고 보상·진행은 없지만 Town, 자원, 영웅, 연구, 저장은 유지한다.
- 클리어한 일반 웨이브는 반복 파밍할 수 없다. 패배한 현재 웨이브는 재훈련 후 횟수 제한 없이 재도전한다.
- 20웨이브 승리는 일반 방어선 완주이며 Campaign 완료나 Rally 처치로 간주하지 않는다.

### 8.2 Campaign

- Campaign은 일반 웨이브와 독립된 2장 6스테이지 순차 원정이다.

| 단계 | 적 구성/요구 power | 최초 보상 |
|---|---:|---|
| c1s1 | wolf×4 / 86.0 | food120, wood100, Ember Warden 조각4 |
| c1s2 | wolf×7 / 150.5 | food160, coal80, Snow Picket 조각4 |
| c1s3 | wolf×8+ravager×1 / 217.1 | iron60, Sparks50, Drift Runner 조각4 |
| c2s1 | wolf×10+ravager×2 / 305.2 | food300, iron100, Iron Bulwark 조각6 |
| c2s2 | wolf×12+ravager×3+titan×1 / 473.3 | Sparks100, Glacier Lance 조각6 |
| c2s3 | wolf×14+ravager×4+titan×2 / 641.4 | food500, steel40, Sparks150, Aurora Sentinel 조각8 |
- 스테이지는 직전 단계 클리어로 해금되고, 표시 요구 전투력 이상이면 성공한다.
- 시도는 병력을 소비하거나 사상자를 만들지 않는 전략 전투력 검사다.
- 자원, Sparks, 영웅 조각 보상은 **최초 클리어에만** 지급한다. 재관람/재도전은 허용하되 반복 보상은 없다.
- Campaign 진행은 일반 `waveCleared`와 Rally boss HP를 변경하지 않는다.

### 8.3 Rally

- Rally는 Alliance 화면에서 진입하는 별도 NPC 협동형 보스 콘텐츠다.
- Rime Alpha, Glacier Behemoth, Hoarfrost Wyrm의 HP를 여러 시도에 걸쳐 누적 감소시킨다.

| 보스 | HP/권장 power | 25% | 50% | 75% | 100% |
|---|---:|---|---|---|---|
| Rime Alpha | 8000/300 | food200 wood160 | coal120 iron80 | Sparks60 | Sparks120+Drift Runner 조각6 |
| Glacier Behemoth | 30000/900 | food500 iron200 | steel60 | Sparks120 | Sparks240+Iron Bulwark 조각8 |
| Hoarfrost Wyrm | 90000/2400 | food1200 steel120 | Sparks200 | Sparks300+Winter’s Eye 조각8 | Sparks500+Pale Marksman 조각10 |
- 각 시도는 8.1의 적 상성 적용 전 `campaignPower`를 그대로 사용한다. `playerDamage=max(1,round(campaignPower))`, `npcDamage=round(playerDamage×0.5)`, `appliedDamage=min(remainingHP,playerDamage+npcDamage)` 순으로 계산한다.
- 시도는 병력 사상자와 입장 재화 없이 가능하다. `appliedDamage>0`인 시도만 유효 시도이며 Alliance 포인트와 Growth Hunter 진행을 각각 1 올린다. Growth Hunter의 `Rally5`는 이런 유효 시도 5회를 뜻한다. 이미 HP 0인 보스 재공격, 취소, 중복 제출은 피해·진행·보상 모두 0이다. 이는 온라인 참여를 흉내 내는 연출이지 실제 협동이 아니다.
- 보스 최대 HP의 25/50/75/100% 누적 피해 도달 보상은 **UTC day key별 보스 주기당 각 1회** 지급한다. 한 시도로 여러 문턱을 넘으면 해당 미수령 보상을 모두 원자적으로 지급한다.
- Rally 화면 첫 진입 또는 첫 시도에서 저장된 day key가 현재 UTC day와 다르면 세 보스 HP, 피해량, claimed milestone을 새 주기로 자동 초기화한 뒤 행동을 처리한다. 처치 후 같은 UTC 일자에는 해당 보스 재공격으로 진행이나 추가 보상을 만들 수 없다.
- Rally 피해·보상은 일반 웨이브와 Campaign 진행을 변경하지 않는다.

## 9. 싱글플레이 메타 시스템

### 9.1 NPC Alliance

- Alliance는 고정 NPC 20명으로 구성되며 사용자 계정이나 다른 플레이어 데이터를 사용하지 않는다.
- 활성 플레이 5분마다 도움 1개, 최대 30개를 보유한다. 도움은 진행 중 Research를 우선하고, 없으면 첫 건물 타이머를 최대 60초 줄인다.
- 기술은 최대 L10이며 레벨당 economy +2%, troop attack +1.5%를 실제 공식에 적용한다.
- 직접 기여 1회는 food100+wood100을 원자적으로 소비하고 Alliance tech point 10을 지급한다. 유효 Rally 시도는 자원 소모 없이 1포인트를 추가하며, 직접 기여는 1초 debounce를 적용한다. tech 누적 threshold는 L1~L10 순서대로 100/250/475/813/1319/2078/3217/4926/7489/11333이다.

### 9.2 Seeded Arena

- Arena는 NPC 사다리이며 실제 PvP가 아니다. 신규 rank 50, 최고 rank 1이다.
- 상대는 저장된 seed와 rank로 결정론적으로 생성한다. 재로드로 상대나 결과를 reroll할 수 없다.
- Arena의 `playerPower`는 8.1의 적 상성 적용 전 `campaignPower`다. NPC 상대에는 병과 구성이 없으므로 infantry/lancer/marksman 상성 계수를 추가하지 않지만 tier, 연구, 장비, Alliance, 3 Lead modifier는 `campaignPower`를 통해 모두 반영한다. 상대 power는 `round(400×1.08^(50-rank)×seededJitter)`이며 jitter는 0.8~1.2다. `playerPower>0`이고 상대 이상이면 승리한다. 승리 후 rank는 `clamp(rankBefore-1,1,50)`, 패배 후에는 `clamp(rankBefore+1,1,50)`이다. 승리는 `round(8×[1+(50-rankBefore)/50])` Sparks(8~16)를 지급하므로 rank 1 승리도 보상을 받고 rank만 1에 머문다. 패배는 보상 0이므로 rank 50 패배도 rank 50과 보상 0을 유지한다.
- 서버 일일 제한이나 구매형 입장권은 두지 않는다. 무제한 도전 가능하되 결과와 보상은 결정론적이어야 한다.

### 9.3 Daily, Growth, Event, VIP

- Daily는 UTC 일자 경계에서 초기화되는 반복 임무다. 진행도와 claimed 상태를 함께 초기화하고 한 주기 내 중복 수령을 금지한다.

| Quest | 목표 | 보상 |
|---|---|---|
| Daily Upgrade | 건물 업그레이드2 | food150 wood120 |
| Daily Battle | 전투 완료3 | iron60 Sparks20 |
| Daily Train | 병력 훈련1 | food100 coal80 |
| Daily Summon | 소환1 | Sparks30 |
| Growth First Wave | wave1 | food200 Sparks50 |
| Growth Builder | 업그레이드10 | food400 wood300 iron150 |
| Growth Scholar | 연구3 | Sparks100 |
| Growth Champion | wave10 | Sparks150 Aurora Sentinel 조각8 |
| Growth Hunter | Rally5 | steel40 Sparks80 |
- Daily Battle의 `전투 완료`는 일반 wave 시도, Campaign 시도, `appliedDamage>0`인 Rally 시도, Arena match 중 결과가 확정·저장된 것을 각각 1회로 센다. 승패와 무관하지만 재관람, 반복 제출, 취소, HP 0 보스 공격 같은 무효 시도는 제외하므로 일반 20웨이브 완주 후에도 달성 가능하다.
- Daily와 Growth 보상은 목표를 처음 충족시킨 원인 행동에서 **자동 수령**한다. 원인 행동 결과, quest progress, 보상 자원, `claimed=true`를 하나의 원자적 v8 저장으로 확정한 뒤 토스트를 표시하며 별도 Claim 버튼은 두지 않는다. 같은 event id 재처리는 claimed marker 때문에 진행·보상을 반복해서는 안 된다.
- UTC 일자 전환은 미완료 Daily progress를 폐기하고 새 day key의 0 progress/미수령 상태를 만든다. 자동 수령 정책상 완료됐지만 미수령인 Daily 상태를 만들 수 없고 이전 day 보상을 소급 지급하지 않는다. Growth progress와 claimed는 일자 전환에 영향받지 않는다.
- Growth는 영구 1회성 이정표이며 저장 초기화 외에는 되돌리지 않는다.
- Event는 UTC 일자마다 `ember_rush`(짝수 day, 생산×1.5)와 `frostfall_hunt`(홀수 day, 생산×1.25)를 교대한다. 표시 window는 해당 UTC day의 00:00~24:00이며 3일 duration을 사용하지 않는다. 오프라인 구간에는 실제 활성 day별 배율을 경계 분할 적용한다.
- VIP는 Sparks 지출 활동으로 쌓이는 영구 진행이며 최대 L12다. 소환은 +100점, 영웅 훈련은 +20점이다. 누적 threshold L1~L12는 100/260/516/926/1581/2630/4307/6992/11287/18159/29154/46746이고 레벨당 economy +1.5%, build speed +2%다.
- VIP 포인트와 혜택은 **현금 지출이 아니라 게임 내 활동**으로만 획득한다. “구매”, 가격, 결제, 상점, 현금 환산을 표시해서는 안 된다.
- Daily, Growth, Event, VIP 모두 싱글플레이 로컬 상태이며 서버 동기화를 암시해서는 안 된다.

## 10. 입력, HUD, 피드백

- 모든 필수 행동은 마우스와 터치로 가능해야 하며 키보드만으로도 포커스 이동·확인·취소가 가능해야 한다.
- Title은 `Space` Play/Continue, `S` Settings, `L` 언어 전환을 지원한다.
- Town은 건물 선택, 생존자 표시, War Camp, Command, Battle, Settings의 가시 버튼을 제공하고 `B` Battle, `S` Settings, `P` Population, `Esc` 패널 닫기를 지원한다.
- Hub는 Back 버튼과 `Esc`/`B`, Result는 버튼과 `Space` Town 복귀를 지원한다. `R`은 도전 가능한 현재 전투 재시도 의미로만 쓴다.
- Town HUD는 5자원+실효 순변화, Sparks, 인구/주거, Warmth 수치·비율·생산 계수, 진행 중 타이머를 표시한다.
- 행동 버튼은 정상/hover/focus/pressed/disabled 상태를 시각적으로 구분하고 disabled 이유를 텍스트로 제공한다.
- 지불 성공은 자원 차감과 타이머/획득 결과를 같은 프레임에 반영한다. 실패는 부족 자원·선행조건을 구체적으로 알리고 상태를 바꾸지 않는다.
- Battle HUD는 wave, 양측 실제 생존 수, 속도, Skip을 제공한다. 속도는 1×/2×/4× 순환, Skip과 `Esc`는 계산된 최종 결과까지 연출만 건너뛴다.
- Skip/속도 변경은 승패, 사상자, 보상에 영향을 주지 않는다.
- 오프라인 복귀 패널은 시간과 food/wood/coal/iron/steel의 **순증감**을 보여 주며 연료 때문에 wood/coal이 음수일 수 있음을 설명한다.

## 11. 시청각 방향

- 아트는 차가운 청색·회색 설원과 따뜻한 주황 Ember를 대비시키는 읽기 쉬운 2D 픽셀아트다.
- 스프라이트는 nearest-neighbour로 선명하게, 텍스트는 실제 표시 픽셀 밀도에 맞춘 백버퍼로 또렷하게 렌더링한다.
- 모든 이름, 로어, 캐릭터, 세력, 스프라이트, 오디오와 로고는 원본 창작물 또는 명확히 허가된 자산이어야 한다.
- Furnace, 저Warmth, 업그레이드 완료, 소환 희귀도, 전투 피격·승패는 색상만이 아니라 형태·아이콘·모션·음향 중 둘 이상으로 구분한다.
- 음악은 차분한 혹한 생존 분위기를 유지하고 UI/build/train/hit/victory/defeat/summon/level/research/boss/quest 피드백을 구분한다.
- master, music, SFX 볼륨은 즉시 적용·저장한다. 브라우저 autoplay 제한 전에는 무음으로 시작하고 첫 사용자 입력 뒤 안전하게 재생한다.

## 12. 언어, 온보딩, 접근성

### 12.1 한국어/영어

- 저장된 설정이 최우선이다. 없으면 브라우저 선호 언어 중 `ko*`가 있으면 한국어, 그 외 영어, 감지 불가 시 한국어다.
- KO/EN 전환은 Title과 Settings에서 가능하고 현재 화면을 즉시 완전히 갱신한다.
- 누락 키는 영어, 영어도 없으면 키 문자열로 fallback하되 출시 빌드 테스트는 누락/중복 키를 실패시킨다.
- 번역 문자열은 버튼 폭, 숫자, 조사 차이를 고려하며 텍스트 잘림을 허용하지 않는다.

### 12.2 온보딩

- 진짜 신규 저장에만 환영 카드를 한 번 표시하고 건너뛸 수 있게 한다.
- 가이드 순서는 `Furnace L2 → Hunters' Hut → Sawmill → Furnace L3 → War Camp → 병력 훈련 → 첫 Battle`이다.
- 다음 행동 배너, 대상 포인터/글로우, 잠금 해제 조건을 함께 제공하고 플레이어 입력을 불필요하게 막지 않는다.
- Warmth 35% 이하 경고는 튜토리얼보다 우선한다.
- `introDismissed`, `guidedComplete`를 저장하고 기존 저장에는 온보딩을 소급 실행하지 않는다.

### 12.3 접근성

- 모든 인터랙티브 요소는 DOM 접근성 미러 또는 동등한 레이어로 role, 이름, 상태, 설명을 노출해야 한다.
- 논리적 탭 순서, 보이는 focus ring, Enter/Space 활성화, `Esc` 닫기, 모달 focus trap과 복귀 포커스를 제공한다.
- 자원 변화, 오류, 전투 결과, 저장 복구는 적절한 live region으로 알린다.
- 본문/버튼 대비는 WCAG AA를 목표로 하고 상태를 색상만으로 전달하지 않는다.
- 최소 터치 타깃은 44×44 CSS px다. 글자 확대 200%에서 핵심 조작과 정보가 잘리거나 겹치지 않아야 한다.
- reduced motion 설정 또는 OS 설정을 존중해 타이틀 부유, 포인터 pulse, Battle tween을 줄이고 즉시 결과를 선택할 수 있게 한다.

## 13. 반응형, safe area, 성능

- 게임 논리 좌표는 960×540을 유지하되 viewport에 맞춰 선명하게 확대/축소한다.
- 가로 화면은 16:9 중심 배치, 넓은 화면은 배경을 확장하되 HUD를 과도하게 벌리지 않는다.
- 세로 화면은 단순 축소/크롭하지 않고 상단 HUD, 중앙 도시/전투, 하단 행동을 재배치한다. 핵심 버튼과 자원은 스크롤 또는 접이식 패널로 모두 접근 가능해야 한다.
- `env(safe-area-inset-*)`를 적용해 노치, 둥근 모서리, 홈 인디케이터가 HUD·버튼을 가리지 않게 한다.
- resize와 orientation change 뒤 1프레임 내 레이아웃·포인터 좌표·카메라를 재계산하고 상태를 잃지 않는다.
- 렌더 스케일은 CSS 표시비율×DPR을 반영한 정수 1~4배를 사용하고 과도한 백버퍼 할당을 방지한다.
- 기준 기기에서 능동 화면은 p95 frame time 16.7ms 이하를 목표로 하며, 중급 모바일 출시 합격선은 10분 세션의 p95 33.3ms 이하, 50ms 초과 프레임 1% 미만이다.
- Battle은 실제 병력 수와 무관하게 가시 유닛을 최대 42개로 집계 렌더링하며, 실제 병력 수 크기의 임시 배열을 만들지 않는다.
- 8시간 오프라인 정산은 기준 신규~중후반 fixture 각 20회에서 p95 200ms 이하, 단일 최악 실행 500ms 이하를 MUST 만족한다. 프레임마다 저장·대형 객체 재생성을 금지한다.

## 14. 저장, 오프라인, 복구

### 14.1 저장 계약

- 단일 진행 슬롯 키는 `frosthold:save`, 기준 schema는 **v8**이다. 설정은 별도 버전 키로 저장한다.
- v8은 자원, Sparks, 인구/배치, 건물/타이머, Warmth, 병력 tier/훈련열, 영웅/Lead, summon seed+pity, Campaign, Research, Gear/charm, Rally, Arena, Alliance, Quests/Event, VIP, wave, onboarding, `lastSeenAt`을 보존한다.
- 활성 플레이 중 **15초마다**, 그리고 비용 지불·업그레이드/연구/훈련 시작·완료·소환·보상 수령·전투 결과·설정 변경·씬 이탈 시 즉시 저장한다.
- `visibilitychange(hidden)`, `pagehide`, Phaser blur/shutdown에도 best-effort 즉시 저장한다.
- 저장은 직렬화·검증 후 임시 키에 쓰고, 읽기 검증 성공 뒤 primary와 last-known-good backup을 교체하는 원자적 절차를 사용한다.
- 저장 실패는 플레이를 중단시키지 않되 사용자에게 “이번 세션이 영속되지 않을 수 있음”을 명확히 알린다.

### 14.2 오프라인 처리

- 경제 시뮬레이션 인정 시간은 `max(0, now-lastSeenAt)`의 최근 **8시간**이다. 50% 효율은 생산 건물의 passive resource output, 생존자 증가, Forge Hall 정련 처리량, Ember Sparks 생성량에만 적용한다.
- Furnace의 wood/coal 연료 요구량, Warmth의 +8/s·-5/s 변화 속도, 건설·연구·훈련의 deadline에는 50%를 적용하지 않는다. 타이머는 시작 때 속도 modifier가 반영된 절대 완료 시각을 저장하고 wall-clock `now`까지 경과했다면 8시간 인정 창 밖에서 끝났더라도 완료된다.
- 건물·연구·훈련 완료, UTC Event 전환, 자원 고갈 경계마다 구간을 나누고 4.1의 공통 순서를 그대로 사용한다. 같은 timestamp의 완료는 건설→연구→훈련의 안정된 순서를 쓰며, 인구 성장·passive 생산·정련·Sparks source rate에만 0.5를 곱한다.
- wood와 coal은 Furnace 연료를 뺀 순증감, iron/coal은 정련 소비까지 반영한다. 자원 부족 시 소비 가능한 구간만 계산하고 음수 잔액을 만들지 않는다. 50% 생산과 정련에도 소수 carry를 보존하고 최종 표시만 반올림한다.
- 최근 8시간보다 오래된 구간에는 생산·연료 소비·Warmth 변화·인구 증가·정련·Sparks를 모두 적용하지 않는다. 다만 그 구간에 deadline이 지난 타이머는 현재 시각 기준 완료 상태로 반영하며, 해당 완료로 생긴 생산 능력에 과거 보상을 소급하지 않는다.
- 시스템 시각 역행, 비유한 timestamp, 과도한 미래 timestamp는 0초로 방어하고 로그/진단 상태를 남긴다.

### 14.3 마이그레이션과 corruption

- 저장 버전 N은 최소한 **N-1과 N-2를 데이터 손실 없이 N으로 마이그레이션**해야 한다. v8 출시 기준 최소 v6·v7을 보존한다.
- 마이그레이션은 단계별 순수 함수로 수행하고 각 단계의 입력·출력 schema와 테스트 fixture를 둔다.
- 더 오래된 버전은 backup/export 선택지를 먼저 제공한 뒤에만 새 게임으로 전환할 수 있다. 조용한 초기화는 금지한다.
- JSON parse, schema, 범위, enum, 배열 크기, 교차 불변식을 검증하고 잘못된 수치는 안전 범위로 clamp하거나 복구 불가로 분류한다.
- primary가 손상되면 last-known-good backup을 시도한다. 복구 성공/실패를 사용자에게 알리고 손상 payload는 진단용 quarantine 키에 보존한다.
- localStorage 사용 불가 시 메모리 세션으로 계속할 수 있으나 비영속 상태를 지속 표시하고 export 가능한 JSON을 제공하는 것을 권장한다.

## 15. 명시적 비지원 계약

출시 UI, 메타데이터, 마케팅, 번역은 다음을 암시해서는 안 된다.

- 온라인 계정, 클라우드 저장, 기기 간 동기화
- 실제 Alliance 회원, 채팅, 타 플레이어 지원
- 실제 PvP, 매칭, 글로벌 Arena 순위
- 현금 구매, IAP, 광고 제거, 유료 VIP, 유료 Ember Sparks
- 서버 권위 일일 리셋 또는 부정행위 방지

“Alliance”, “Arena”, “Rally”, “VIP”가 장르 관습 용어로 남더라도 첫 진입 설명에 **NPC/로컬 싱글플레이·무결제**임을 명시한다.

## 16. 수용 기준

### 16.1 핵심 루프

- [ ] 신규 저장으로 10분 안에 가이드 순서대로 생산 건물, 훈련, 첫 Battle까지 도달할 수 있다.
- [ ] Title→Town→Command 8화면→Town 및 Town→Battle→Result→Town 경로가 포인터·터치·키보드로 모두 완료된다.
- [ ] Command 화면 이탈, 새로고침, 탭 숨김 후에도 직전 확정 행동이 보존된다.
- [ ] 모든 비-Furnace 건물은 hard gate와 `building level≤Furnace level`을 지킨다.
- [ ] 건물별 배치 변경은 해당 생산량만 바꾸며 배치·총원·주거 불변식을 위반하지 않는다.

### 16.2 경제와 Warmth

- [ ] Warmth 100%/0%에서 Warmth 계수는 각각 1.0/0.25이고 0%만으로 패배하지 않는다.
- [ ] wood 또는 coal 하나가 부족하면 같은 구간에 두 연료 모두 소비되지 않는다.
- [ ] 정련은 iron 2+coal 1당 steel 1 비율과 처리량을 지키고 부분 입력 차감을 하지 않는다.
- [ ] HUD 실효 `/초`는 staffing, housingScore 기반 만족도, Warmth, 가산 economyBonus, Event, source multiplier의 권위 식을 소수 3자리 내부 정밀도와 소수 2자리 표시로 계산한다. 같은 조건의 60초 실제 순변화와 비교했을 때 자원별 절대 오차 0.01 이하 또는 상대 오차 0.1% 이하 중 큰 허용치를 만족하고 반올림은 최종 표시에서만 한다.
- [ ] 같은 초기 상태의 활성/오프라인 1시간은 동일한 경계·연산 순서를 쓰고, 오프라인은 passive 생산·인구·정련·Sparks의 **source rate에만** 0.5를 적용하며 연료 요구·Warmth 속도·deadline은 1.0을 유지한다. 이 때문에 연료 고갈과 Warmth 피드백이 있는 fixture의 최종 순생산은 활성 결과의 정확히 50%일 필요가 없다. 8시간 밖에는 timer 완료 외 경제·연료·Warmth 변화가 없어야 한다.

### 16.3 성장과 전투

- [ ] 12영웅의 희귀도×병과 분포, 최대 3 Lead, 소유 검증, 전투력/Lead levelFactor·starFactor, 보너스 1회 적용이 테스트된다.
- [ ] 영웅 훈련은 Warming Ward와 Sparks20을 검사해 XP300·VIP20을 원자 지급하고 다중 레벨업·성급 cap의 잔여 XP wallet을 보존한다.
- [ ] 20연속 non-epic 뒤 다음 pull은 epic+이고 중복 조각과 pity/seed가 reload 후 동일하다.
- [ ] 16연구의 선행·Archive·단일 진행·비용·완료 경계와 T2~T4 해금이 검증되고 건설·연구 duration은 `base/(1+buildSpeed)` millisecond ceiling과 1초 하한을 따른다.
- [ ] 6장비·charm의 자원 성분별 지수 비용·올림과 병력 tier·상성 보너스가 표시값 및 전투 공식에 한 번씩 반영되고, 혼합 tier의 classPower와 비례 생존자 배분이 정확한 총원·사상자를 보존한다.
- [ ] 일반 전투의 Skip 및 1×/2×/4×가 동일 입력의 승패·사상자·보상을 바꾸지 않는다.
- [ ] 일반 20웨이브, Campaign 6스테이지, Rally 3보스의 진행 키와 보상 횟수가 서로 독립적이다.
- [ ] Campaign 반복은 최초 보상을 중복 지급하지 않고 Rally 피해·유효 시도·UTC day reset·각 milestone은 공식대로 주기당 한 번만 반영된다.

### 16.4 메타, 저장, 품질

- [ ] Alliance/Arena/Rally/VIP 첫 화면에 NPC 로컬 싱글플레이·무결제 설명이 노출된다.
- [ ] Arena는 8.1 `campaignPower`를 상성 없이 사용하고 상대와 결과, `[1,50]` rank clamp와 양 끝 보상, Event 회전은 저장 seed/UTC 일자에 대해 재현 가능하다.
- [ ] Daily는 UTC 일자 변경 시만 초기화되고, 전투 완료는 네 콘텐츠의 유효 확정 결과만 세어 wave20 이후에도 달성 가능하다. Daily/Growth 달성 원인 행동·progress·보상·claimed는 자동 수령 원자 저장되고 Growth는 초기화되지 않는다.
- [ ] 15초 autosave와 모든 즉시 저장 트리거가 v8 전체 상태 round-trip을 보존한다.
- [ ] 8시간 초과 오프라인은 정확히 8시간만 50%로 인정하고 순연료/정련 소비를 보고한다.
- [ ] v6·v7 fixture가 v8로 데이터 손실 없이 이동하며 손상 primary는 backup 복구 또는 안전한 오류 UX를 제공한다.
- [ ] KO/EN 모든 키, placeholder, 잘림, 브라우저 언어 우선순위가 자동 검증된다.
- [ ] 1920×1080 DPR1, 고DPR, 모바일 가로/세로, safe-area viewport에서 HUD와 포인터가 정확하다.
- [ ] 키보드 전 경로, focus trap, live announcement, 대비, reduced motion, 44px 터치 타깃을 접근성 점검한다.
- [ ] 대규모 병력에서도 가시 battler≤42, 실제 병력 크기 배열 없음, 목표 프레임과 오프라인 정산 예산을 충족한다.
- [ ] `npm run typecheck`, `npm run test`, `npm run build`가 통과하고 순수 제품 규칙은 Phaser 비의존 테스트로 보호된다.

## 17. 구현 현황과 목표 대비 갭

이 표는 작성 시점의 코드 기준이며, 완료 표시는 본 문서 전체 수용을 뜻하지 않는다.

| 영역 | 현황 | 목표 대비 갭 |
|---|---|---|
| Town 경제·건물·Warmth | 대부분 구현 | Warmth가 만족도에 재반영되어 25% 아래로 이중 저하; Sparks가 무연료에도 생성; HUD가 raw rate 표시 |
| 자원·정련·오프라인 | 대부분 구현 | 연구/이벤트 시간 경계와 전역 시뮬레이션 parity 부족; Town 밖 경제 정지 가능 |
| 건물 15종 | 부분 구현 | Frost Vault, Envoy Hall, Warming Ward, 3 Yard의 실효 게이트/소비처가 미연결 |
| 인구·배치·만족도 | 부분 구현 | 건물별 배치를 저장하지만 생산은 배치 총합으로 전역 적용; 한 건물 과배치가 인정됨 |
| 12영웅·3 Lead | 구현 | 콘텐츠별 편성 슬롯/시각적 자리 구분 보강 필요 |
| 소환·pity·중복 | 부분 구현 | 순수 시스템은 seed 주입 가능하나 실제 씬은 `Math.random()`을 써 seed/state 재현 불가 |
| 16연구·장비·charm | 부분 구현 | buildSpeed가 실제 건설/연구 시간에 미적용; charm 교체 API의 무고지 덮어쓰기 위험 |
| T1~T4·상성 | 구현 | Yard 게이트와 일부 공유 modifier, 특히 Alliance 전투 보너스 연결 보강 필요 |
| 일반 20웨이브 | 대부분 구현 | late-wave Frostbeast가 계산/HUD에는 있으나 Battle sprite roster에서 누락; 대군 임시 배열 위험 |
| Campaign | 구현 | 즉시 power check로만 표현되어 전투 피드백이 얕음; 반복 무보상 설명 강화 필요 |
| Rally | 부분 구현 | 처치 후 주기 reset/일자 정책과 보상 재주기 UX 미구현 |
| NPC Alliance | 부분 구현 | 무료 무한 기여 가능; Envoy gate와 Alliance troop bonus 연결 부족 |
| Seeded Arena | 구현 | 무제한 도전 정책과 NPC 명시 UX 검증 필요 |
| Daily/Growth/Event/VIP | 부분 구현 | Event가 3일 설정과 일일 교체가 충돌; VIP buildSpeed 미작동; 무결제 설명 보강 필요 |
| 입력/HUD/피드백 | 부분 구현 | 포인터·일부 단축키는 있으나 완전한 키보드 포커스·disabled 이유·실효 rate 부족 |
| 시청각·KO/EN·온보딩 | 대부분 구현 | 장시간/모바일/누락 번역 E2E와 저동작 모드 부족 |
| 960×540 반응형 | 부분 구현 | crisp backbuffer/resize는 구현; portrait 재배치, safe area, 44px 타깃 미완료 |
| 접근성 | 미구현 | DOM 의미론, focus 관리, live region, 색상 외 상태, 200% 확대 기준 필요 |
| 저장 v8·15초 저장 | 부분 구현 | 주요 Town 행동은 저장; pagehide/visibility, 원자 쓰기, 실패 고지 없음 |
| 마이그레이션·corruption | 미구현 | 현재 구버전은 신규 게임으로 폐기; 구조 검증, v6/v7 migration, backup/quarantine 없음 |
| 비지원 경계 | 로직상 충족 | UI 전반에 온라인/PvP/IAP가 아닌 NPC·로컬·무결제임을 일관되게 명시해야 함 |

### 출시 우선순위

1. 저장 v6/v7→v8 마이그레이션, schema 검증, backup 복구와 전역 즉시 저장을 먼저 완료한다.
2. 활성/오프라인 단일 시뮬레이션, Warmth 25% 정책, 원자 연료·정련, 실효 HUD를 일치시킨다.
3. seeded summon, 건물별 배치, buildSpeed, Alliance/Yard/지원 건물 연결을 완료한다.
4. portrait/safe area/키보드·스크린리더·reduced motion을 출시 차단 기준으로 올린다.
5. 마지막으로 Battle late-wave 표현, 대군 성능, Rally 주기와 메타 설명을 다듬는다.
