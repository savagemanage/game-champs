# Arena Champions 목표 제품 스펙

- 문서 상태: **규범적(Normative)**
- 적용 범위: `packages/champs`
- 기준 제품 버전: 1.x 목표 상태
- 최종 수정: 2026-09-09

## 1. 문서 권위와 용어

이 문서는 Arena Champions의 **목표 제품 계약**이다. 현재 구현을 설명하는 README나 인수인계 메모가 아니라, 기획·디자인·코드·테스트·QA가 따라야 할 단일 기준이다. 이 문서와 `README.md`, `handoff.md`, 코드, 테스트 또는 기존 동작이 충돌하면 제품 의도는 이 문서가 우선한다. 다만 배포 전까지 남은 불일치는 §18의 갭으로 추적한다. 밸런스 수치의 실행 가능한 단일 원본은 최종적으로 `src/config`와 순수 데이터 모듈이어야 하며, 이 문서의 규범 수치와 동기화되어야 한다.

RFC 2119식 키워드를 다음처럼 사용한다.

- **MUST / MUST NOT**: 출시 수용에 필수인 요구사항/금지사항이다.
- **SHOULD / SHOULD NOT**: 강한 기본값이다. 예외는 근거, 사용자 영향, 대체 검증을 기록해야 한다.
- **MAY**: 필수 계약을 훼손하지 않는 선택 구현이다.
- “플레이어”는 한 명의 로컬 인간 사용자, “봇”은 로컬 AI 챔피언, “코어”는 넥서스를 뜻한다.
- 시간은 별도 표기가 없으면 경기 경과 초, 거리는 3000×3000 논리 월드 단위, 화면 크기는 CSS 픽셀이다.

## 2. 제품 비전

Arena Champions는 설치·계정·네트워크 대기 없이 브라우저에서 즉시 시작해, 한 명의 플레이어가 AI 9명과 완결된 5v5 MOBA 한 판을 **10~15분**에 경험하는 오리지널 로컬 게임이어야 한다.

### 2.1 타깃과 플랫폼

- 주 타깃은 MOBA의 라인·성장·오브젝트·공성 루프를 짧은 세션으로 즐기려는 13세 이상 캐주얼/복귀 플레이어다.
- 보조 타깃은 한국어 또는 영어를 쓰며 키보드·마우스 대신 터치로 플레이하는 사용자다.
- MUST: 최신 안정판 Chrome, Edge, Firefox, Safari의 데스크톱 및 모바일 웹에서 별도 설치 없이 동작한다.
- MUST: 정적 GitHub Pages 배포, HTTPS, 로컬 저장만으로 완전한 한 판을 제공한다.
- SHOULD: 최초 메뉴 상호작용까지 3초 이내, 전투 진입 요청부터 조작 가능까지 6.5초 이내여야 한다(중간급 기기, 캐시 온, 정상 네트워크).

### 2.2 디자인 원칙

1. **정직한 축약**: 5v5 MOBA의 핵심 의사결정은 보존하되 지원하지 않는 온라인·경쟁 기능을 암시하지 않는다.
2. **읽히는 전투**: 입력 결과, 피격, 쿨다운, 위험, 목표와 승리 조건은 1초 안에 이해 가능해야 한다.
3. **동일 규칙**: 인간과 봇은 같은 이동·자원·사거리·쿨다운·피해·상점 규칙을 사용한다.
4. **짧고 확정적인 판**: 넥서스 파괴를 우선하되 모든 경기는 15:00에 종료한다.
5. **입력 독립성**: 핵심 명령은 데스크톱과 터치 모두에서 누락 없이 제공한다.
6. **로컬 우선·프라이버시 기본**: 게임은 진단 동의 여부와 무관하게 오프라인에 가까운 정적 환경에서 완성되어야 한다.
7. **오리지널 표현**: 명칭·캐릭터·아이템·아트·오디오는 타 상용 IP를 모사하지 않는다.

### 2.3 비목표 및 명시적 비지원

- MUST NOT: 인터넷 멀티플레이, 계정 로그인, 매치메이킹, 랭크, 채팅, 친구/파티, 관전, 클라우드 저장을 제공하거나 제공한다고 표현한다.
- MUST NOT: 현금 결제, 광고, 확률형 구매, 배틀패스, 외부 분석/광고 SDK를 포함한다.
- MUST NOT: 외부 CDN, 런타임 원격 아트·폰트·오디오 fetch에 필수 의존한다.
- `src/online`의 프로토콜·스냅샷 코드는 미래 기반일 뿐이며, 출하 제품의 네트워크 계약은 `network: 'none'`이다.
- 완전한 e스포츠 밸런스, 사용자 제작 콘텐츠, 캠페인, 음성 채팅, 게임패드는 1.x 비목표다.

## 3. 전체 사용자 흐름

제품은 다음 상태 흐름을 MUST 제공한다.

`메뉴 → 매치 종류 → 전장/난이도 → 선택 → 로딩 → 전투 → 결과 → 재대결 또는 메뉴`

1. **메뉴**: 계정 레벨, 통화, Learning 완료 여부, 설정, Standard, Practice, Learning을 표시한다. 유효한 `lastSetup`이 있으면 Continue를 가장 먼저 표시한다.
2. **매치 종류**: 메뉴의 세 버튼이 종류를 확정한다. Standard 기본 난이도는 Normal, Practice/Learning은 Easy다.
3. **전장/난이도**: Conquest/Midline 카드와 Easy/Normal/Hard를 모두 표시한다. 카드에는 라인 수, 무작위 로스터 여부, 중립 목표 유무를 선택 전에 명시한다.
4. **선택**: Conquest는 플레이어 챔피언과 서로 다른 상대 대표 챔피언을 고른다. 잠긴 플레이어 챔피언은 250 통화로 해금할 수 있다. Midline은 유료 선택을 가장하지 않고 “무작위 로스터” 슬롯과 실제 추첨 규칙을 명시한다.
5. **로딩**: 폰트·핵심 텍스처·스케일·첫 렌더가 준비되기 전 HUD와 입력을 활성화하지 않는다. 진행 상태를 보조기술에 알린다.
6. **전투**: 일시정지/설정/항복을 포함한 모든 종료 경로는 명시적인 상태 전이를 가진다.
7. **결과**: 승/패/무, 종료 이유, 실제 플레이한 대진과 다음 9개 통계를 고정 순서로 표시한다: 경기 시간, 플레이어 챔피언 처치, 플레이어 사망, 플레이어 미니언 막타, 아군 epic monster 처치 횟수, 플레이어가 모든 적에 가한 실제 피해(overkill 제외), 종료 레벨, 플레이어 총 획득 골드(시작 500 포함·지출 비차감), 종료 시 보유 골드. 중도 포기는 통계 대신 “기록되지 않음”을 표시한다. 실제 적용 보상과 계정·숙련도 진행을 표시하고 진입 시 제목으로 포커스를 이동한다.
8. **재대결**: 동일한 종류·전장·난이도·요청 설정으로 새 `matchId`를 발급해 즉시 재시작한다. Midline 실제 챔피언은 새 seed로 다시 추첨한다.
9. **Continue**: 저장된 요청 설정을 복원한다. Conquest 플레이어 픽이 더 이상 유효/해금 상태가 아니면 선택으로 보내며, 잘못된 데이터를 그대로 전투에 전달하지 않는다.

브라우저 새로고침·뒤로가기·스토리지 실패가 진행 중 전투의 복원을 보장하지는 않는다. 이 제한은 첫 진입 도움말에 SHOULD 안내한다.

## 4. 매치 종류 계약

| 종류 | 목적 | 기본 난이도 | 통화 | 계정/숙련도 배율 | 완료 조건 |
|---|---|---:|---:|---:|---|
| Standard | 정식 로컬 경기와 진행 | Normal | 지급 | 1.00 | 정상 결과 도달 |
| Practice | 부담 없는 챔피언·빌드 연습 | Easy | 0 | 0.50 | 정상 결과 도달 |
| Learning | 기본 조작·목표를 배우는 안내 경기 | Easy | 0 | 0.35 | 안내 목표와 정상 결과 도달 |

- 사용자 표시명 **Learning**은 내부 `matchKind='tutorial'`과 같은 종류이며 별도의 네 번째 모드가 아니다.
- 모든 종류는 Easy/Normal/Hard와 두 전장을 선택할 수 있어야 하며 동일한 권위 시뮬레이션을 사용한다.
- Practice와 Learning도 승패·통계·계정 XP·숙련도 XP를 기록하지만 통화는 MUST 0이다.
- Learning은 이동, 기본 공격, QWER, 귀환/상점, 레벨, 포탑, 승리 조건을 단계별로 안내하고 수행 여부를 추적해야 한다. 안내는 전투를 영구 차단하지 않아야 하며 건너뛰기를 제공한다.
- `tutorialCompleted`는 모든 필수 Learning 안내를 완료하고 결과에 도달한 최초 1회에만 true가 된다. 단순히 `matchKind=tutorial` 결과를 받은 것만으로 완료 처리해서는 안 된다.
- Practice는 치트/무적/쿨다운 초기화 샌드박스가 아니다. 해당 기능은 별도 승인 전 MUST NOT 암시한다.

## 5. 전장 계약

| 규칙 | Three-Lane Conquest | Midline Skirmish |
|---|---|---|
| 활성 라인 | top, mid, bot | mid만 |
| 팀 | 역할별 5명, 총 5v5 | 역할별 5명, 모두 mid, 총 5v5 |
| 챔피언 | Conquest 선택을 실제 적용 | 매치 seed로 플레이어/상대 실제 픽을 서로 다르게 추첨 |
| 첫 웨이브/주기/간격 | 10초 / 24초 / 180ms | 10초 / 20초 / 150ms |
| 중립 목표 | 활성 | 없음 |
| 억제기 부활 | 150초 | 120초 |
| 사망 부활 | min(26, 4 + 1.25×레벨)초 | min(20, 3 + 0.9×레벨)초 |
| 부활 무적 | 2초 | 2.5초 |
| 갑작스러운 죽음/상한 | 12:00 / 15:00 | 12:00 / 15:00 |

- Midline 무작위 추첨은 10명 전체를 체험 풀로 사용해도 되며 잠금 해제를 요구하거나 통화를 차감해서는 안 된다. 숙련도는 실제 플레이 챔피언에 귀속한다.
- 같은 요청과 seed는 같은 10인 편성을 생성해야 한다. 재대결은 새 seed를 사용한다.
- Conquest의 선택 픽은 실제 전투에 MUST 반영한다.

## 6. 챔피언 로스터와 팀 편성

1.x 로스터는 다음 오리지널 10명으로 고정하며, 각 역할에 정확히 2명 이상을 유지한다.

| 챔피언 | 클래스 | 역할/주 포지션 |
|---|---|---|
| Ashborne, Duskarrow | Marksman | bot |
| Nightveil, Frostquill | Assassin / Mage | mid |
| Grimtrail, Embermage | Assassin / Mage | jungle |
| Ironhold, Thornwarden | Bruiser | top |
| Dawnsong, Wardlight | Enchanter | support |

- 팀은 ally/enemy 각각 top·jungle·mid·bot·support 한 명씩 정확히 5명이어야 한다.
- 인간은 ally에 정확히 1명이며 나머지 9명은 AI다. Conquest에서 jungle은 mid 경로, support는 bot 경로를 기본 사용하고 상황에 따라 로밍할 수 있다.
- 두 팀의 챔피언 집합은 MUST 서로소여야 한다. 같은 픽 충돌 시 인간 픽을 보존하고 enemy가 같은 역할의 다른 챔피언으로 양보한다.
- 비강제 슬롯은 `(playerPick, enemyPick, mode, matchSeed, role, side)`에서 파생한 seed로 결정한다. `Math.random` 또는 프레임 순서에 따라 편성이 바뀌면 안 된다.
- 각 챔피언은 패시브와 Q/W/E/R의 고유 데이터·툴팁·효과를 가져야 한다. 전투 효과는 툴팁의 피해·회복·이동·기절·버프 의미와 일치해야 하며 장식 데이터로 남겨서는 안 된다.
- 신규 프로필은 Ashborne, Ironhold, Embermage와 통화 500으로 시작한다. 나머지 챔피언의 해금 가격은 각 250이다.

### 6.1 챔피언 실행 카탈로그

레벨 `L`의 성장 스탯은 `base + growth×(L-1)`이다. 전원 자원 300, 자원 재생 8/s, 기본 AP 0이며 자원/AP 성장치는 없다. Armor의 기본값은 28이다. 공격속도도 같은 선형 성장 공식을 쓰고 CDR은 최종 쿨다운에 적용하되 50%를 넘지 않는다.

| 챔피언 | HP 기본/+성장 | AD 기본/+성장 | Armor +성장 | 이동 | 사거리 | AS 기본/+성장 |
|---|---:|---:|---:|---:|---:|---:|
| Ashborne | 540/+101 | 62/+3.5 | +4.2 | 330 | 575 | 0.68/+0.040 |
| Nightveil | 590/+96 | 68/+3.3 | +4.0 | 345 | 150 | 0.72/+0.035 |
| Ironhold | 720/+115 | 60/+3.6 | +4.8 | 340 | 175 | 0.62/+0.032 |
| Embermage | 510/+92 | 52/+3.1 | +3.9 | 335 | 525 | 0.60/+0.020 |
| Dawnsong | 500/+88 | 50/+3.0 | +3.8 | 330 | 550 | 0.625/+0.022 |
| Thornwarden | 700/+112 | 63/+3.7 | +4.6 | 340 | 175 | 0.63/+0.030 |
| Grimtrail | 585/+98 | 66/+3.4 | +4.1 | 345 | 150 | 0.70/+0.036 |
| Frostquill | 505/+90 | 53/+3.1 | +3.9 | 335 | 550 | 0.60/+0.021 |
| Duskarrow | 535/+100 | 61/+3.5 | +4.1 | 330 | 600 | 0.66/+0.042 |
| Wardlight | 495/+87 | 49/+3.0 | +3.8 | 335 | 525 | 0.62/+0.022 |

공통 액티브 피해는 별도 표기가 없으면 `base + 0.6×AP` raw이며 Armor 공식으로 감소한다. AoE 반경은 220, stun은 1.25초다. heal은 `base + 0.4×AP`이고 최대 HP를 넘지 않는다. dash는 충돌 가능한 최종 유효 지점에서 멈춘다. 아래 수치는 `비용/CD초/사거리` 순서다.

| 챔피언 | 패시브(P) | Q | W | E | R |
|---|---|---|---|---|---|
| Ashborne | 기본 공격 3회째에 표식을 소비해 +15 raw; 대상별 4초 유지 | 관통 화살 `40/6/900`, D80 단일 | 화살비 `60/12/650`, D110 AoE | 구르기 `50/16/400`, 무피해 dash | 낙일 화살 `100/90/1200`, D260 단일 |
| Nightveil | dash 후 3초 내 다음 기본 공격 +40 raw; 중첩 불가 | 쌍독니 `35/5/300`, D95 단일 | 연막 `40/14/200`, 3초간 피격 전까지 이동 +20% | 환영 돌진 `45/10/600`, dash+D70 | 처형 그림자 `100/80/725`, HP 비율 최저 적에게 dash+D300 |
| Ironhold | HP 35% 이하 진입 시 Armor +25/3초, 내부 CD 12초 | 방패 강타 `30/8/300`, D90 AoE | 방벽 `50/15/0`, 최대 HP 12% 보호막/3초 | 돌진 걸쇠 `55/13/550`, dash+D60 | 지진 닻 `100/100/450`, D150 AoE+stun |
| Embermage | 스킬 피해가 25+0.1AP/3초 burn; 갱신만 하고 중첩하지 않음 | 화염 화살 `50/5/1000`, D120 | 운석 `70/9/850`, D160 AoE | 작열 사슬 `60/18/700`, D60+stun | 지옥불 `100/110/550`, D400 AoE |
| Dawnsong | 스킬 사용 시 600 내 HP 비율 최저 아군 H35, 내부 CD 3초 | 별의 창 `55/7/950`, D75 | 치유 합창 `80/11/700`, 지정 아군 H180 | 수호 찬가 `65/14/800`, 지정 아군 보호막 140/3초 | 여명 `100/120/900`, 범위 내 아군 H180+Armor 20/4초 |
| Thornwarden | 기본 공격을 받으면 공격자에게 12 raw 반사, 같은 공격자당 1초 CD | 덤불 휘두르기 `35/7/350`, D85 AoE+20% slow/1.5초 | 뿌리 자세 `50/14/0`, Armor +30/3초 및 slow 해제 | 덩굴 `45/12/600`, D55+0.6초 pull | 숲의 봉기 `100/105/500`, D140 AoE+stun |
| Grimtrail | HP 35% 미만 적을 향할 때 이동 +25, 700 밖에서는 비활성 | 찢기 `40/6/450`, D90 | 덮치기 `45/13/250`, 대상 방향 dash+D60 AoE | 덤불 질주 `50/11/550`, dash+D50 | 사냥꾼 심판 `100/85/700`, dash+D280 |
| Frostquill | 피해 스킬이 20% slow/1.5초; stun 대상에는 중복 적용하지 않음 | 빙하 화살 `50/6/950`, D110 | 우박 `65/10/800`, D140 AoE | 얼어붙은 시구 `60/16/650`, D55+stun | 절대의 겨울 `100/115/1100`, 첫 대상 D360, 관통 대상 D180 |
| Duskarrow | 공격 없이 300 이동 후 다음 기본 공격 +18 raw; 공격/사망 시 거리 초기화 | 어스름 사격 `45/7/850`, D85 | 가시 덫 `55/13/700`, 4초 유지, 최초 접촉 D95+slow 30%/2초 | 물러서기 `50/15/450`, 커서 반대 방향 dash | 황혼 일제 `100/95/1300`, 직선상 각 적 D250 |
| Wardlight | 세 번째 스킬 사용마다 650 내 HP 비율 최저 아군 H45 | 봉화 화살 `55/8/900`, D70 | 달래는 빛 `75/12/750`, 지정 아군 H180 | 경계 섬광 `60/15/700`, D45+stun | 불침번 `100/120/850`, 범위 아군 보호막 160+이동 15%/4초 |

- 패시브 stack, trap, burn, shield, slow, pull, movement buff는 직렬화 가능한 권위 상태이며 렌더 효과가 아니다.
- 같은 비율 slow는 강한 값만 적용하고 지속시간은 긴 값으로 갱신한다. shield는 실제 HP보다 먼저 감소하며 서로 다른 source는 합산, 같은 source는 큰 값으로 갱신한다.
- 툴팁은 위 base 수치, AP 계수, 비용, 실제 CDR 반영 쿨다운, 사거리/반경, 지속시간을 모두 표시해야 한다.

### 6.2 아이템 실행 카탈로그

| 아이템 | 가격·레시피(조합비) | 최종 능력치 | 고유 효과 |
|---|---|---|---|
| Hunter’s Relic | 400 | HP+45, AD+5 | 없음 |
| Swift Boots | 900 | 이동+45 | 없음 |
| Shortsword | 350 | AD+15 | 없음 |
| Sunfire Greatblade | Shortsword+Vampiric Edge+1850=3100 | AD+65, AS+0.25, CDR10% | 기본 공격 적중 시 15 raw 추가, 동일 대상 1초 CD |
| Ember Rod | 850 | AP+40 | 없음 |
| Archmage Crown | Ember Rod+Mana Crystal+1700=3200 | AP+110, 자원+300, CDR15% | 없음 |
| Iron Vest | 800 | HP+200, Armor+30 | 없음 |
| Aegis Colossus | Iron Vest+Mana Crystal+1450=2900 | HP+450, Armor+60, CDR10% | HP 30% 이하 진입 시 200 보호막/4초, CD 45초 |
| Vampiric Edge | 900 | AD+15, AS+0.15 | 기본 공격 실제 피해의 8% 회복 |
| Bloodreaver | Vampiric Edge+Shortsword+2150=3400 | AD+55, AS+0.35, HP+150 | 기본 공격 실제 피해의 12% 회복 |
| Mana Crystal | 650 | 자원+250, CDR10% | 없음 |
| Chrono Core | Mana Crystal+Ember Rod+1100=2600 | 자원+600, AP+60, CDR20% | 스킬 적중 시 현재 쿨다운 0.5초 감소, 시전당 1회 |

- 완성품 구매는 인벤토리의 구성품을 정확히 한 번 소비하고 조합비만 차감한다. 소비된 구성품 능력치는 완성품과 중복 적용하지 않는다.
- 완성품을 직접 살 때는 정가를 내며 인벤토리 6칸을 초과할 수 없다. 동일 완성품 중복 구매는 금지하고 거절 이유를 표시한다.
- 흡혈은 overkill이 아닌 대상의 실제 HP 감소량을 기준으로 하며 구조물·미니언에도 적용하되 neutral objective에는 적용하지 않는다.

## 7. 핵심 조작과 전투

### 7.1 이동·공격·스킬·귀환

- 지면 클릭/탭은 이동, 적 클릭/탭은 지속 타깃 및 사거리 내 기본 공격을 명령한다. 양쪽 마우스 버튼은 동일하며 컨텍스트 메뉴를 열지 않는다.
- 기본 공격 간격은 `1 / attackSpeed`, 방어력 0 이상 피해는 `round(raw×100/(100+armor))`를 사용한다. 원거리 투사체는 명중 예정 시각과 안정적인 동률 순서를 가진다.
- `A` 후 지점 지정은 attack-move, `S`는 정지 및 타깃 해제다. 터치에도 별도 Attack-move와 Stop 버튼을 MUST 제공한다.
- Q/W/E/R은 자원·쿨다운·사거리 검증 뒤 마지막 조준점/터치 드래그 조준점으로 시전한다. CDR 상한은 50%다.
- 모든 챔피언은 기본 자원 300, 초당 자원 재생 8을 가진다. 우물에서는 최대 HP와 자원을 각각 초당 8% 추가 회복한다.
- **귀환**: 기지 밖에서 `B` 또는 터치 Recall을 누르면 6초 채널을 시작한다. 이동/공격/스킬 명령 또는 적 피해는 취소하며, 완료 시 ally 우물로 이동한다. 기지 안의 `B`는 상점을 연다. 귀환 중 상태와 취소 원인을 HUD/음성 없이도 알 수 있게 표시한다.
- 스킬·아이템·버프의 수치와 설명이 다르면 실행 수치가 아니라 승인된 config와 이 문서를 맞춰 수정해야 한다.

### 7.2 레벨·경제·상점

- 레벨은 1~18이며 다음 레벨 XP는 `280 + (현재레벨-1)×100`이다. 18레벨 이후 XP 바는 cap 상태를 표시한다.
- 시작 골드는 500, 패시브 수입은 초당 2.04다. 골드는 음수가 될 수 없다.
- 막타 보상(gold/xp): melee 21/60, caster 14/30, siege 60/93, super 85/97, champion 300/220, turret 160/120, inhibitor 220/180이다.
- assist, 공유 XP, shutdown은 1.x 비지원이며 UI/도움말이 이를 암시해서는 안 된다.
- 상점은 ally 우물 220 이내에서만 구매 가능하며 상태 이탈 시 닫힌다. 권위 시뮬레이션이 거리·골드·중복·슬롯·아이템 ID를 재검증한다.
- 인벤토리는 6칸이다. 완성 아이템 구매 시 보유 구성품을 소비하고 그 가격을 차감한 **남은 조합 비용**만 지불한다. 구성품과 완성품 능력치를 이중 적용해서는 안 된다.
- 목표 카탈로그: Hunter’s Relic 400, Swift Boots 900, Shortsword 350, Sunfire Greatblade 3100, Ember Rod 850, Archmage Crown 3200, Iron Vest 800, Aegis Colossus 2900, Vampiric Edge 900, Bloodreaver 3400, Mana Crystal 650, Chrono Core 2600.
- 아이템명 또는 툴팁이 lifesteal·slow·buff를 말하면 해당 효과를 실제 구현해야 한다. 미구현 효과는 이름/설명에서 제거할 수 있다.

### 7.3 사망·부활

- 치명 피해는 `alive → dead → respawning → invulnerable → alive`의 단방향 상태 전이를 만든다. 중복 치명 이벤트는 무시한다.
- 사망 중 조작은 이동/공격/시전을 발생시키지 않으며 남은 시간을 0.1초 단위로 표시한다.
- 부활은 ally 우물에서 HP·자원을 전부 채우고 시작하며 모드별 무적 시간을 적용한다. 무적은 적에게 시각·텍스트로 구분되고 피해를 받지 않는다.

## 8. 미니언·구조물·정글·중립 목표

### 8.1 미니언과 구조물

- 기본 웨이브는 melee 3 → caster 3이며 매 3번째 웨이브에 siege 1을 추가한다. 적 억제기가 파괴된 라인은 선두 super 1을 추가한다.
- 라인/팀당 생존 미니언은 최대 24다. 초과 spawn은 버리지 않고 0.75초 뒤 재시도하되 무한 큐를 만들지 않는다.
- Conquest 한 팀은 라인별 outer/inner/inhibitor turret와 inhibitor, nexus turret 2, nexus 1로 구성한다(포탑 11, 억제기 3, 넥서스 1). Midline은 mid 포탑 3, 억제기 1, nexus turret 2, nexus 1이다.
- 구조물 HP: 일반/억제기 포탑 2000, nexus turret 2700, inhibitor 2400, nexus 5500; 방어력은 모두 40이다. 사격 포탑은 사거리 260, AD 152, 초당 공격 0.83이다.
- 라인 구조물은 순서대로만 공격 가능하다. 활성 라인 중 억제기 하나가 파괴되면 nexus turret가 열리고, 두 nexus turret가 파괴되어야 nexus가 열린다.

### 8.2 정글 캠프

- Conquest는 양 팀 Blue/Red/Raptors/Wolves/Gromp/Krugs와 강의 Scuttle 2곳을 실제 전투 엔티티로 제공해야 한다. Midline에는 없다.
- 재생성: Blue/Red 300초, 소형 캠프 135초, Scuttle 150초. 보상(gold/xp): Blue/Red 90/115, Gromp 80/130, Wolves 85/115, Raptors 88/120, Krugs 96/145, Scuttle 55/55.
- Blue는 120초간 CDR 10%와 자원 초당 +5, Red는 120초간 기본 공격 피해 +15와 20% 둔화를 제공한다. 버프의 획득·남은 시간·소멸은 HUD에 표시한다.
- 캠프는 전투 이탈 시 시작 위치로 돌아가 HP를 회복해야 하며 지형 표식만 존재해서는 안 된다.

### 8.3 중립 목표

- Conquest의 Ember Dragon은 2:00에 최초 등장하고 처치 150초 뒤 재등장한다. 처치 팀은 영구적으로 스택당 AD +3/AP +3/방어력 +2를 얻는다.
- Stone Warden은 3:00~7:00에 한 번만 등장한다. 처치 팀은 90초 안에 사용할 수 있는 공성 효과를 얻고, 사용 시 유효한 구조물에 900 피해를 준다. 자동 즉시 소모해서는 안 된다.
- Void Tyrant는 8:00에 최초 등장하고 처치 150초 뒤 재등장한다. 처치 팀은 90초간 AD +24/AP +40을 얻는다.
- HP/AD/방어력: Dragon 3500/120/21, Warden 6800/140/40, Tyrant 9000/220/90. 중립 몬스터는 사거리 280, 초당 공격 0.7을 기본으로 한다.
- 목표 보상(gold/xp): Dragon 25/200, Warden 100/306, Tyrant 300/800. 팀 버프는 전원에게, 막타 gold/xp는 막타 챔피언에게 적용한다.

## 9. 승패, sudden death, hard cap

- 상대 nexus HP가 0이 되는 즉시 승리한다. 양쪽이 같은 권위 tick에 0이면 그 tick의 모든 피해·처치·골드 이벤트를 stable order로 마친 직후 입력을 닫고, 해당 **판정 tick 스냅샷**으로 아래 점수와 동점 정책을 사용한다. 15:00 이전 동시 파괴에서 미래 상태를 참조해서는 안 된다.
- objectivePoints는 처치할 때 팀에 누적한다: Ember Dragon 1점, Stone Warden 2점, Void Tyrant 3점. 재등장한 같은 종류도 매 처치 누적하며 한 tick의 복수 처치는 `(objective kind order, stable entity id)` 순으로 모두 반영한다. `epicMonstersKilled`는 단순 처치 횟수, `objectivePoints`는 15분 판정 가중치이므로 별도 필드여야 한다.
- 12:00~14:59는 **Sudden Death**다. 진입을 시각·텍스트·오디오로 알리되 숨은 공격력/부활/경제 보정은 적용하지 않는다. 압박은 기존 웨이브·목표·성장으로 만든다.
- 15:00에는 입력을 닫고 다음 점수로 즉시 판정한다.

`점수 = 1000×nexus HP 비율 + 300×생존 구조물 비율 + 25×팀 챔피언 킬 + 40×objectivePoints + 0.01×팀 총 획득 골드`

- nexus HP, 구조물, 킬, objectivePoints, 총 골드는 모두 같은 판정 tick 스냅샷을 사용한다.

- `생존 구조물 비율`은 nexus를 제외한 해당 전장의 고정 방어 구조물 중 **판정 tick 스냅샷**에서 HP가 0보다 큰 수의 비율이다. 일반 time cap에서는 15:00, 조기 동시 nexus 파괴에서는 그 동시 파괴 tick이 판정 tick이다. Three-Lane Conquest는 진영당 각 라인의 outer turret·inner turret·inhibitor, 총 9개를 분모로 쓰고 Midline Skirmish는 mid outer turret·inner turret·inhibitor, 총 3개를 분모로 쓴다. 구조물 종류를 런타임 생성 수로 추론해서는 안 된다. 파괴 상태이거나 부활 대기 중인 inhibitor는 0개, 판정 tick의 이벤트 처리 전에 부활을 완료해 HP가 복구된 inhibitor는 1개로 센다. nexus는 별도의 HP 비율 항에만 반영한다.
- `팀 총 획득 골드`는 해당 진영 5명의 시작 골드, passive gold, 막타 bounty를 모두 합한 누적 gross gold이며 구매 지출을 빼지 않는다. 결과 화면의 플레이어 개인 총 획득 골드와는 별도 필드다.

- 모든 분수는 0~1로 clamp하고 NaN/음수 입력은 0으로 정규화한다.
- 점수가 정확히 같으면 nexus HP 비율 → 생존 구조물 비율 → 킬 → 목표 → 총 골드 순으로 비교한다. 모두 같으면 **무승부**다. 무승부는 패배 기본치의 계정/숙련도 XP를 주고 통화는 Standard에서만 패배 기본치로 지급하며 승리·패배 횟수에는 넣지 않는다.
- 플레이어에게 불리한 고정 tie winner, 프레임 순서, 임의 난수로 동점을 깨서는 안 된다.

## 10. AI 난이도 계약

| 난이도 | 반응 지연 | 판단 주기 | 진행 배율 |
|---|---:|---:|---:|
| Easy | 500ms | 900ms | 0.80 |
| Normal | 300ms | 650ms | 1.00 |
| Hard | 150ms | 450ms | 1.25 |

- 난이도는 반응/재판단 cadence와 보상만 변경한다. 봇 HP·피해·사거리·골드·쿨다운·시야를 몰래 보정하거나 플레이어 입력을 미리 읽어서는 안 된다.
- 모든 봇은 동일한 순수 결정 함수를 사용한다. 28% 이하 HP에서는 원칙적으로 후퇴하되 1.5 기본 공격 사거리 안의 35% 미만 적은 마무리할 수 있다. 비공격 회복/버프는 85% 이하, 목표 전환은 HP 45% 이상에서만 고려한다.
- 봇은 역할 편향, 포탑 위험, 아군/적 수적 우위, 웨이브, 목표, 구매 가능성을 판단해야 한다. 동점 행동 우선순위는 `R > W > Q > E > attack > retreat > approach`다.
- AI는 인간과 동일한 `castAbility`, 투사체, 구매 검증, 사망/부활 경로를 MUST 사용한다.

## 11. 입력 매트릭스

| 기능 | 데스크톱 | 터치 | 요구 |
|---|---|---|---|
| 이동/타깃 | 좌/우 클릭 | 탭 | 동등 |
| 조준 스킬 | 커서 + Q/W/E/R | 버튼 드래그/탭 + 조준 표시 | 사거리·방향 미리보기 |
| attack-move | A 후 클릭 | Attack-move 후 탭 | MUST |
| 정지 | S | Stop 버튼 | MUST |
| 귀환 | 기지 밖 B | Recall 버튼 | 6초 채널 |
| 상점 | 기지 안 B/HUD | Shop 버튼 | 기지에서만 구매 |
| 일시정지 | P 또는 Esc | Pause 버튼 | 오버레이 |
| 설정 | 전역 설정 버튼 | 전역 설정 버튼 | 모든 화면 |
| 항복 | Pause 메뉴 | Pause 메뉴 | 확인 2단계 |

- 터치 타깃은 최소 44×44이며 safe-area를 침범하지 않는다. 전투 canvas는 브라우저 스크롤·확대 제스처와 명령을 혼동하지 않아야 한다.
- 폼/대화상자에 포커스가 있으면 전투 단축키가 MUST 발동하지 않는다.

## 12. HUD, 피드백, 일시정지, 이탈, 오류

- HUD는 모드/종류/난이도, 15분 타이머, ally/enemy 대표 HP, 포탑·억제기 수, 플레이어 HP/자원/XP/레벨, QWER 쿨다운/비용, 골드, 버프, 목표 타이머/스택, 미니맵, shop 가능 여부를 표시한다.
- 피해·회복·킬·레벨업·구매 성공/거절·귀환 취소·사망/부활·Sudden Death·결과는 색 하나에 의존하지 않는 최소 2개 채널(텍스트/형태/소리/모션 중)로 피드백한다.
- HUD publish는 최대 10Hz로 제한하되 권위 결과와 생명 상태 전이는 즉시 보낸다.
- `P`/`Esc`, Pause 버튼, 탭 비가시화, Settings 열기는 권위 시뮬레이션과 타이머를 멈춘다. `Esc`는 열린 modal/shop이 있으면 최상위 항목을 먼저 닫고, 없을 때 Pause를 연다. Shop 자체는 게임을 멈추지 않는다. 재개 시 누적 delta를 한 프레임에 처리하지 않는다.
- 항복은 확인 대화상자를 거쳐 `abandoned` 결과로 메뉴에 돌아간다. 보상·완료·숙련도·승패를 지급하지 않으며 동의된 경우에만 거친 진단 이벤트를 남긴다.
- 시작 실패/6.5초 watchdog은 `role=alert`와 **재시도**, **선택으로 돌아가기**를 제공한다. 재시도는 Phaser 인스턴스·listener·timer를 완전 폐기하고 새 nonce로 시작한다.
- 저장 실패는 플레이를 막지 않지만 “이번 세션의 진행이 저장되지 않을 수 있음”을 지속적이고 비방해적인 상태로 알린다.

## 13. 시청각 방향

- 2.5D dimetric 벡터 전장은 flat 권위 좌표를 시각 투영만 해야 한다. 카메라 shake/recoil/tween은 충돌·사거리·타이머를 변경하지 않는다.
- 10명은 색 외에도 실루엣·무기/머리 장식·문장으로 구분되어야 한다. ally/enemy, 위험/안전, 버프/디버프는 형태·명도·패턴을 함께 쓴다.
- 아트는 로컬 절차형 SVG를 1회 rasterize/cache하고 무제한 texture/VFX를 생성하지 않는다.
- 오디오는 UI, 기본 공격, QWER, 피격, 사망, 승/패, 목표, 귀환, 절차형 음악과 선택형 ambience를 제공한다. master/mute/ambient 설정을 저장하고 동시 one-shot voice는 최대 24다.
- AudioContext 미지원/차단 시 무음으로 완전히 플레이 가능해야 한다. 음향 단서만으로 필수 정보를 전달해서는 안 된다.

## 14. 언어와 접근성

### 14.1 한국어/영어와 i18n

- `ko`와 `en`은 메뉴부터 결과·오류·도움말·챔피언/스킬/아이템까지 동일한 key 집합을 MUST 가진다.
- 첫 방문 기본은 한국어, 이후 `champs:language` 선택을 사용하며 누락 문자열은 한국어로 fallback한다.
- 언어 변경은 즉시 `<html lang>`, 문서 제목, 숫자 형식을 갱신하고 재시작을 요구하지 않는다. 사용자에게 raw i18n key를 보여서는 안 된다.
- 한국어는 어절 단위 줄바꿈을 우선하고, 번역 길이 30% 증가에도 핵심 버튼/수치가 잘리지 않아야 한다.

### 14.2 접근성 목표

- MUST: 게임 외 UI와 전투 HUD는 WCAG 2.2 AA의 키보드, 포커스 표시, 이름/역할/값, 대비 기준을 충족한다.
- 모든 메뉴·모드·선택·설정·상점·결과는 키보드만으로 순서대로 조작 가능해야 한다. listbox는 Arrow/Home/End와 roving tabindex를 제공한다.
- 화면 전환은 주 제목, 대화상자는 첫 안전 컨트롤로 포커스를 이동하고 닫을 때 호출 요소로 복귀한다. 포커스는 modal 밖으로 빠져나가면 안 된다.
- `prefers-reduced-motion`은 shake, flash, slow motion, 큰 위치 tween과 비필수 애니메이션을 제거하며 실시간 변경을 반영한다.
- 색각: 팀/상태/쿨다운/위험은 색만으로 구분하지 않고 AA 대비, 윤곽, 아이콘, 패턴을 병행한다.
- 스크린리더: canvas는 장식으로 숨길 수 있으나 별도 semantic battle summary가 HP/자원/레벨/쿨다운/현재 타깃/목표/사망 타이머/결과를 제공해야 한다. 긴급 이벤트는 polite/assertive live region을 남용하지 않고 우선순위를 구분한다.
- 실시간 공간 전투의 완전한 비시각 동등성은 1.x 비목표지만, 스크린리더 사용자는 매치를 시작·일시정지·항복하고 상태와 결과를 독립적으로 읽을 수 있어야 한다.

## 15. 반응형과 성능

- Phaser 논리 stage는 900×640, `Scale.FIT`, 중앙 정렬을 유지한다. 화면 비율이 달라도 늘이거나 잘라내지 않고 letterbox/safe-area를 사용한다.
- 검증 viewport는 최소 1280×800 데스크톱, 390×844 세로, 844×390 가로, 320×568 소형이다. 어느 경우에도 핵심 행동 버튼·HP·QWER·Pause가 viewport 밖으로 나가면 안 된다.
- 좁은 화면에서 미니맵/상세 목표를 축약할 수 있지만 승리 조건, 위협, 목표 등장 여부를 접근 가능한 텍스트로 유지한다.
- 성능 목표(중간급 2022 모바일/일반 4코어 노트북): 전투 60 FPS 데스크톱/30 FPS 모바일의 프레임 95% 이상, 권위 update delta 최대 50ms, 입력 피드백 100ms 이내, HUD 최대 10Hz.
- MUST: 라인/팀당 미니언 24, transient VFX·damage text·audio voice에 유한 budget, 모든 listener/RAF/timer/Phaser instance의 unmount 정리.
- Phaser는 전투 진입 전 lazy-load하고 별도 vendor chunk로 유지한다. 메뉴는 Phaser 다운로드/초기화를 기다리지 않는다.

## 16. 프로필, 보상, 멱등성, 개인정보

### 16.1 로컬 프로필과 보상

- `champs:profile`은 버전, account XP, 통화, 해금, 챔피언별 XP/경기/승, Learning/Practice 완료, 마지막 요청 설정, seen flag, 적용 match ID를 저장한다.
- 로드는 모든 필드를 비신뢰 입력으로 검증한다. 알 수 없는 미래 버전은 안전한 기본 프로필로 닫고, 손상 필드는 개별 정규화하며 starter 3명은 항상 보존한다.
- 계정 레벨은 `floor(sqrt(xp/250))+1`, 숙련도는 200 XP당 1레벨이고 10레벨 cap이다.
- 기본 보상: 승리 account/currency/mastery `120/90/75`, 패배 `70/40/45`. §4 종류 배율과 §10 난이도 배율을 곱해 반올림하며 Practice/Learning currency는 항상 0이다.
- 결과가 실제로 적용된 뒤의 프로필과 실제 적용 delta만 결과 화면에 표시한다.

### 16.2 `matchId`와 중복 결과

- 각 경기의 `matchId`는 설치 내 충돌 가능성이 무시 가능한 seed+단조 counter 기반 ID여야 하며 빈 문자열을 허용하지 않는다.
- 최근 64개 적용 ID를 저장한다. 보존 창 안의 중복/빈 ID는 프로필, 완료 플래그, 통화, 숙련도, `lastSetup`, 결과 보상 표시, 완료 진단을 **어느 것도** 변경/중복 발생시키면 안 된다.
- 한 scene은 종료 callback을 정확히 한 번만 발생시켜야 한다. React도 방어적으로 멱등 처리한다.
- 64개 이전 ID의 재수신은 정상 UI 경로에서 불가능해야 한다. import/디버그 경로가 생기면 영구 digest 또는 더 큰 journal을 별도 설계한다.

### 16.3 진단 동의와 프라이버시

- 진단 기본 상태는 `unknown=disabled`다. 명시적 Allow 이후에만 활성화하고 GPC/DNT가 있으면 동의보다 우선해 차단한다.
- 수집 MAY 항목은 session kind, mode/result/duration bucket, command/rejection category, FPS bucket/long-frame boolean, crash category/source뿐이다.
- MUST NOT 수집: 이름, 이메일, IP, 정확한 URL/query, 키 입력 내용, 채팅, stack/message, 기기 지문, 정밀 위치, 원격 식별자.
- 큐는 메모리 전용 최대 128개/TTL 24시간, 로컬 export sink는 최대 512개다. 원격 endpoint와 자동 upload는 MUST NOT 존재한다.
- Deny는 큐와 export 데이터를 즉시 지우고, Clear는 이벤트만 지우며 동의 상태는 유지한다. Export는 활성 상태에서 사용자가 누를 때만 로컬 JSON을 생성한다.
- privacy 신호 변경은 같은 세션에서 즉시 UI·capture listener·record gate에 반영한다.

## 17. 기술 경계, 결정론, 테스트 가능성

- **Phaser/BattleScene**은 위치, 시간, AI, 전투, 경제, spawn, 구조물, 목표, 승패의 유일한 권위다.
- **React**는 메뉴 상태 전이, canvas host, loading/error, HUD/대화상자/상점 표시, 설정, 프로필 적용, 결과를 소유하되 전투 공식을 복제하지 않는다.
- `battleStore`는 직렬화 가능한 immutable snapshot의 Phaser→React 경계와 검증 전 purchase command의 React→Phaser 경계다.
- combat, AI, 생명 상태, 점수, 팀 편성, map, waves, structures, economy, objectives, items, progression, migration은 Phaser/DOM 없는 순수 함수로 유지한다.
- 권위 난수는 명시적 match seed에서만 파생하며 state를 직렬화할 수 있어야 한다. `Date.now`, `Math.random`, 렌더 프레임, locale은 권위 결과에 영향을 주면 안 된다.
- 권위 시뮬레이션은 고정 tick 또는 동일 입력/동일 delta stream에서 동일 결과를 보장해야 한다. 동시 사건은 `(dueAt, insertionOrder 또는 stable id)`로 정렬한다.
- 렌더·오디오·카메라·reduced-motion은 권위 RNG나 상태를 소비/변형하면 안 된다.
- 테스트는 정상 예제뿐 아니라 경계 시각(10:00/12:00/15:00), 동점, 중복 ID, 손상 save, 같은 픽, 난수 seed, frame spike, locale, storage/audio 미지원도 포함한다.

## 18. 구현 현황 및 갭

이 표는 작성 시점 코드 대비 목표 차이다. “충족”도 회귀 테스트로 유지해야 하며, “부분/미충족”은 본문의 MUST를 완화하지 않는다.

| 영역 | 현황 | 목표 대비 갭/필수 조치 |
|---|---|---|
| 메뉴→결과 흐름 | 충족 | 전체 실제 Phaser E2E와 ResultScreen 직접 테스트 추가 |
| Standard/Practice 보상 | 충족 | 정확한 모든 종류×난이도 보상 표를 테스트로 고정 |
| Learning | 충족 | 이동·공격·QWER·귀환/상점·레벨·포탑·승리 조건 단계와 skip, 수행 추적 및 결과 도달 completion gate 회귀 유지 |
| Conquest 선택 | 충족 | 선택 픽 반영 회귀 유지 |
| Midline 선택 | 충족 | 무작위 로스터 UI와 versioned canonical seed 경계, 재대결 새 seed 회귀 유지 |
| 5v5/10명/역할/비미러 | 충족 | 고정 seed 불변식 유지 |
| 이동/공격/QWER | 충족 | pull/trap, 충돌 유효 dash, 최저 HP 비율 처형, 임시 Armor/cleanse, 반대 방향 후퇴, 명시 slow/이동 buff와 수치 tooltip, Dawnsong W/E·Wardlight W 지정 아군 cursor 조준, Grimtrail W 조준 방향 dash 후 AoE, Frostquill R 첫 대상 full/후속 50% 관통, Duskarrow R 직선 전 대상 적중을 구현; 챔피언 고유 효과 직접 자동화는 테스트 품질 행의 잔여 갭으로 유지 |
| 귀환 | 충족 | 6초 B/터치 recall, 이동·공격·스킬·모든 hostile 피해 취소와 HUD 사유 회귀 유지 |
| 터치 입력 | 충족 | QWER pointer drag/tap, 사거리·방향 preview, attack-move, stop, recall 경로 유지; 실제 기기 회귀 필요 |
| 상점/아이템 | 충족 | 6칸, 구성품 소비·가격 credit, 중복 검증, Sunfire/Aegis/lifesteal/Chrono/Blue·Red 실제 효과 회귀 유지 |
| 레벨/경제/사망 | 충족 | 수치, gross gold, 단방향 생명 상태, 모드별 부활·무적과 HP/resource full restore 유지; assist 미지원 안내 회귀 필요 |
| 미니언/구조물 | 충족 | 수치·unlock·super spawn 회귀 유지 |
| 정글 캠프/버프 | 충족 | 양 팀 지정 pack과 Scuttle을 실제 다중/단일 엔티티로 제공하고 final-member clear, leash/heal, respawn, Blue/Red 적용, 전체 camp 및 활성 buff HUD timer를 유지 |
| 중립 목표 | 충족 | Warden은 90초 held charge로 수동 사용하며 enemy는 5초 이상 보유 후 siege pressure 또는 만료 직전의 결정적 정책으로 같은 900-damage 검증 경로 사용 |
| Sudden Death/15분 | 충족 | 동일 tick snapshot 점수, 공정한 draw 결과·보상·UI와 hard-cap 판정 유지; 전체 경계 replay 증거는 §19 미충족 |
| AI 난이도 | 충족 | cadence-only/no-cheat 계약, 공통 cast 경로, stable tie order와 team-level held Warden 정책 유지 |
| Pause/가시성 | 충족 | manual/settings/hidden reason별 권위 정지, modal 우선 Esc와 resume accumulator 폐기 유지 |
| 항복/중도이탈 | 충족 | 2단계 확인, abandoned 결과, 무보상·무기록 경로 유지 |
| 로딩 오류 | 충족 | role=alert/watchdog, Retry/Back과 nonce 기반 Phaser 완전 재초기화 회귀 유지 |
| 시청각 | 부분 | 절차 SVG/SFX/ambience/reduced motion 있음; 실제 음악 경로와 다수 챔피언 고유 오디오 부족 |
| ko/en i18n | 충족 | key parity/fallback/문서 lang 테스트 유지 |
| 접근성 | 부분 | semantic UI·focus trap·listbox 키보드·semantic battle summary는 충족; 실제 AA 대비/색각 3종, 4 viewport와 전체 키보드 흐름 자동 검증 미충족 |
| 900×640 반응형 | 부분 | FIT/세로·가로 CSS 있음; 320폭, overflow, 실제 touch/브라우저 자동 검증 없음 |
| 프로필/저장 | 충족 | migration/fail-safe와 저장 불가 지속 안내 회귀 유지 |
| 중복 `matchId` | 부분 | 최근 64개 profile/reward 화면/완료 진단은 멱등; 64개 이전 import/debug 영구 digest 정책은 미설계 |
| 진단/프라이버시 | 부분 | opt-in/GPC/DNT/allowlist/no endpoint와 Settings/runtime 동기화는 충족; 같은 세션 privacy signal 변경의 전용 event 통합 및 브라우저 E2E 미충족 |
| React/Phaser 경계 | 충족 | 전투 공식의 React 복제 금지 유지 |
| 완전 결정론 | 부분 | 60Hz fixed-step accumulator, backlog 이후 command tick 배정, stable command/event sequence, canonical world-aim와 canvas move/target/attack-move 지점 log, versioned match seed, match request+정확한 target tick command의 JSON-safe replay export/import는 충족; 100회 전체 replay 실행·동일성 증거는 미충족 |
| 테스트 품질 | 부분 | 기존 423개 pure/UI 테스트는 통과; 새 fixed-step replay, champion 고유 효과, pointer drag, pack lifecycle/Warden 정책의 직접 자동화 및 Result/Settings/game-end, responsive/E2E/접근성 공백은 남음 |

## 19. 정량적 출시 수용 기준

다음은 1.x 출시 후보마다 모두 MUST 통과한다.

1. `npm run typecheck`, `npm run test`, `npm run build`, `npm run docs:check`, `git diff --check`가 루트에서 0 오류다.
2. 30개 흐름(3 종류×2 전장×3 난이도의 기본 18개 + 종류/전장별 Continue 6개 + 종류/전장별 재대결 6개)의 자동/수동 매트릭스에서 메뉴→결과가 막힘 없이 완료된다.
3. 같은 seed와 입력 로그를 100회 재생했을 때 팀 편성, 권위 이벤트 순서, 승패, 보상이 100% 동일하다.
4. 10,000개 생성 팀에서 ally/enemy 각 5명, 역할 5종, 인간 1명, 팀 간 champion 중복 0을 만족한다.
5. 11:59.999/12:00/14:59.999/15:00 경계 테스트에서 phase와 종료가 정확하고, 15:00 이후 권위 tick이 진행되지 않는다.
6. 같은 `matchId` 결과를 2~10회 전달해도 프로필/화면/진단의 적용 보상과 완료 이벤트는 정확히 1회다.
7. ko/en key parity 100%, raw key 노출 0, 핵심 4 viewport에서 가로 스크롤과 잘린 핵심 컨트롤 0이다.
8. 키보드만으로 메뉴→모드→선택→일시정지→항복 확인 및 설정/상점 대화상자를 완료하며, 포커스 손실 0이다.
9. 터치만으로 이동, 타깃, QWER 조준, attack-move, stop, recall, shop, pause를 수행하며 핵심 타깃은 모두 44×44 이상이다.
10. reduced motion에서 camera shake/flash/slow motion/큰 위치 tween 발생 0, 색각 시뮬레이션 3종에서 팀·HP·쿨다운·위험 오인 차단 요소가 각각 2개 이상이다.
11. 1280×800에서 프레임의 95%가 60 FPS, 390×844/844×390에서 95%가 30 FPS 이상이며 입력 시각 피드백 p95가 100ms 이하다.
12. 전투 10회 연속 진입/이탈 후 Phaser instance, 전역 listener, RAF/timer, audio voice의 누적 증가가 없다.
13. 동의 전·Deny·GPC·DNT에서 기록/내보내기 이벤트 0, Allow 상태에서도 allowlist 밖 필드와 원격 요청 0이다.
14. 손상/미래 버전/사용 불가 localStorage에서도 크래시 0이며 기본 프로필로 플레이 가능하고 저장 불가 상태가 안내된다.
15. Chrome/Edge/Firefox/Safari 최신 안정판에서 데스크톱 및 해당 엔진의 모바일 뷰포트 smoke test가 통과하고 console/page error가 0이다.
