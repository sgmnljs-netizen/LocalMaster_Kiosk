# 🍏 LocalMaster 키오스크 애플 미니멀 표준 디자인 규약 (Apple Minimalist Kiosk Design Protocol)

본 문서는 **LocalMaster 키오스크(Kiosk)의 모든 화면, 모달 팝업, 카드, 결제/배정 UI**에 전역 적용되는 **최상위 표준 디자인 시스템 명세서(SSOT)**입니다.
앞으로의 모든 신규 화면 개발 및 기존 화면 리팩토링 시 본 규약을 100% 의무 준수해야 합니다.

---

## 🎨 키오스크 4대 절대 디자인 표준 규약

### 1. ⚪ 스노우 화이트 & 스모키 프로스트 글래스 베이스 (Pure White & Smoked Frost Blur)
- **카드/모달 배경**:
  - 라이트 모드 패널: `#ffffff` 순백색 (Pure White) + `1px solid #e5e5ea` 헤어라인 경계선.
  - 다크/광고 모드 패널: `rgba(24, 24, 26, 0.85)` 스모키 프로스트 다크 블러 (`backdropFilter: blur(40px)`).
- **곡률 (Border Radius)**:
  - 카드 및 패널: 애플 미니멀 곡률 `borderRadius: 28px` 또는 `32px` 통일.
- **아우터 섀도우**:
  - 요란한 컬러 파동 대신 애플 특유의 소프트 앰비언트 섀도우 (`boxShadow: 0 10px 30px rgba(0, 0, 0, 0.05)`).

---

### 2. 🖤 원색 90% 제거 & SF Pro Display 딥 블랙 타이포그래피 (High Contrast Monotone)
- **텍스트 컬러 고정**:
  - 카드 타이틀 및 주요 메인 텍스트: **애플 시그니처 딥 블랙 (`#1d1d1f`) / 퓨어 화이트 (`#ffffff`)**
  - 서브 설명글 및 부연 안내: **차콜 그레이 (`#86868b`)**
- **5% 이하의 섬세한 인디케이터 포인트 컬러 강제**:
  - 텍스트 전체를 원색(초록/보라)으로 칠하는 행위를 엄격히 금지합니다.
  - 카드의 구별 및 상단 배지는 오직 **5% 이하의 미니멀 인디케이터 닷(`🟢 #34c759`, `🔵 #0071e3`)** 및 **애플 칩 뱃지(`BEST 추천`, `PREMIUM`)**에만 제한적으로 부여합니다.
- **대형 타이포그래피 (Large Display Numbers)**:
  - 타석 번호, 이용 시간(분) 등 핵심 수치는 **44px ~ 48px SF Pro Display 대형 울트라 볼드 (`fontWeight: 800`, `letterSpacing: -1px`)**로 시원하고 가독성 100%로 강조합니다.
  - **타석 카드 그리드 규격 (27인치 세로형 FHD 1080×1920 황금비율)**:
    - 종횡비: **`aspectRatio: '1 / 1.22'`** (상하 높이 15px+ 완충 여백 확보로 바닥 클리핑 원천 차단).
    - 내부 패딩: **`padding: '13px 11px'`** (좌우 유효폭 10px+ 추가 확보).
    - 사용 중 박스(하단 52px): 잔여시간(`12px` Bold)과 예정시각(`11px` Bold) 모두 **`whiteSpace: 'nowrap'` 강제**로 2줄 개행(`남/음`, `예/정`) 완전 방어, 슬림 프로그레스 바는 상하 3px 안전 여백으로 바닥 테두리 밖 돌출 클리핑 100% 해소.
    - 상단 활성 타석 배너: `whiteSpace: 'nowrap'` 및 `28px` UltraBold로 타석 번호 단어 쪼개짐(`타/석`) 완전 방어.

---

### 3. 💊 애플 시그니처 필 버튼 (Apple Signature Pill Button)
- **버튼 형태**:
  - 일반 메인 액션 버튼(결제하기, 배정하기, 확인 등)은 **완전 원형 필 버튼 (`borderRadius: 999px`, `height: 56px` ~ `96px`)**으로 통일하며, 타석 최종 배정 확정 CTA(`AssetSelectModal.tsx` `data-testid="asset-confirm-cta-btn"`)는 27인치 터치 인지 극대화를 위해 **`height: 108px`, `fontSize: 30px` Weight `900`** 풀와이드 시맨틱 필 버튼을 적용합니다.
- **버튼 컬러 스킴**:
  - 화이트 배경 카드: **애플 딥 차콜 필 버튼 (`background: #1d1d1f`, `color: #ffffff`)**
  - 다크 프로스트 카드: **애플 스노우 화이트 필 버튼 (`background: #ffffff`, `color: #000000`)**
  - 타석 배정 최종 확정 CTA (`AssetSelectModal.tsx` 2단 시선 릴레이): 미선택 시 뉴트럴 슬레이트(`#f1f5f9`)로 대기하다가, 고객이 이용권 카드를 터치하는 즉시 **즉시 배정 에메랄드 주얼 그라디언트(`.asset-cta-ready`)** / **대기 예약 앰버 주얼 그라디언트(`.asset-cta-ready-amber`)**와 외곽 호흡형 헤일로 링(`::before` `inset: -7px`)·내부 화이트 유리 광택 스윕(`.asset-cta-sheen-clip::after`)·우측 화살표 넛지(`.asset-cta-arrow`)가 동시 점등됩니다(`{NN}번 타석 · {HH:mm ~ HH:mm} 즉시 배정` / `대기 예약` 직접 각인, 이모지 미사용; `Why`: 1장 보유 시에도 자동 선선택하지 않고 카드 광택 ➔ 확정 CTA 점등으로 시선을 넘겨 오터치 배정을 방지).
- **마이크로 터치 유도 인터랙션**:
  - 버튼 내부 좌측에 콕콕 누르는 손가락 탭 마이크로 애니메이션(`Hand` 아이콘 + `animate-hand-tap`)을 필수로 탑재하여 0.1초 만에 터치를 강력하게 유도합니다.

---

### 4. 🇰🇷 100% 한글 명칭 & 실물 데이터 표출 (Fact-Based Korean UI)
- 스마트폰/노트북 등의 가짜 디바이스 프레임을 화면에 노출하는 행위를 금지하고, 100% 순수 키오스크 터치 패널에 최적화된 시안으로 구성합니다.
- 영문 오남용을 지양하고 **`골프 타석 배정표`**, **`03번 타석`**, **`이용시간: 60분`**, **`이용시간대: 11:31 ~ 12:31`**과 같이 100% 한글 명칭과 명확한 실시간 KST 데이터를 표출합니다.

---

### 5. 📐 본인 인증 모달 절대 위치 고정 및 크리스탈 라이트 블러 투과 규약 (Zero-Shift & Crystal Backdrop Protocol)
- **크리스탈 라이트 블러(Crystal Light Blur) 배경 투과 강제**:
  - `MemberAuth` 및 `DecisionModal`(배정 방식 선택 팝업)은 `position: 'fixed'`, `inset: 0`, `zIndex: 9000` 오버레이로 감싸되,
  - 배경 투명도는 **`background: 'rgba(15, 23, 42, 0.38)'`** 및 **`backdropFilter: 'blur(3px)'`**로 표준화합니다.
  - 이를 통해 팝업 카드 전면의 높은 집중도를 유지하면서도, 뒤쪽의 1F/2F/3F 타석 현황판과 선택된 타석 번호가 흐릿하지 않고 또렷하게 실물 투과(Spatial Orientation 보존)됩니다.
- **상단 전광판(TopTeeboxDashboard) 선택 타석 블루 펄스 점등 (Halo Pulse)**:
  - 타석이 선택되면 상단 전광판의 해당 타석 칩이 **애플 딥 블루(`#0071e3`)**로 점등되며, `0 0 0 3px #ffffff, 0 0 0 6px #0071e3` 더블 링 테두리와 `scale(1.12)` 및 부드러운 펄스 애니메이션(`selectedBayHaloPulse`)이 활성화되어 팝업 뒤에서도 선택 타석이 즉시 눈에 띕니다.
- **본인 인증(MemberAuth) 모달 2중 안심 배지 & 상단 배정 컨텍스트 티켓 바 (Double Assurance + Context Ticket)**:
  - 타석 배정 목적(`ALLOCATE_MEMBERSHIP`, `ALLOCATE_DAILY`)으로 인증 시, 모달 헤더 `회원 본인 인증` 타이틀 바로 옆에 **`[ ⛳ {NN}번 타석 배정 ]`** 블루 필 뱃지(`rgba(0, 113, 227, 0.08)`, `border: 1.5px solid rgba(0, 113, 227, 0.35)`)를 표출하고, 직하단에 애플 스노우 화이트 고정형 **`member-auth-allocation-banner`**(`즉시 배정` 에메랄드 / `대기 예약 · 약 N분 대기` 앰버 `22px` 배지, `42px` `{층} · {NN}번 타석`, `30px` `HH:mm 즉시 시작` / `HH:mm 대기 시작`)를 상시 표출하여 인증 도중에도 배정 맥락을 100% 인지시킵니다.
- **카드 외곽 및 위치 고정 (Top Y Anchor)**:
  - 외부 오버레이 컨테이너: `justifyContent: 'flex-start'`, 타석 배정 컨텍스트 진입 시 `paddingTop: '96px'`(비배정 일반 인증 시 `160px`).
  - 모달 카드 치수: **`width: 1,000px` × `minHeight: 1,260px`**(타석 배정 컨텍스트 티켓 바 포함 시; 비배정 일반 인증 시 `minHeight: 1,040px`).
  - 상단 Y좌표(Top Y)가 절대 고정되어 탭 전환이나 키패드 터치 시 **상하 들썩임(Layout Shift) 편차 0.0000px** 보장.
- **회원 이름 확인 모달 (`detectedMember`) Apple HIG 초대형 고대비 프리뷰**:
  - AI `Sparkles` 아이콘·중복 이용권 요약 띠·이모지 장식을 전면 제거하고 모달 폭을 **`920px`**로 확대하며, **`[{마스킹 이름}] 회원님` (`56px`)** + **`본인이 맞으신가요?` (`32px`)**, 중앙 **`detected-member-allocation-preview`**(`즉시 배정`/`대기 예약 · 약 N분 대기` 배지 + `48px` `{층} · {NN}번 타석` + 이용권 선택 전 단계이므로 종료 시각 대신 **`46px` `HH:mm` + `28px` `즉시 시작` / `대기 시작`**) 및 하단 **`96px` (`28px`/`32px`) 확인/취소 필 버튼**을 적용합니다.
  - 보유 이용권 선택 모달(`AssetSelectModal.tsx`)도 Apple HIG 순백색 **`1,008px`** 시트(`46px` 헤드라인 + 1줄 컨텍스트 + **1장 보유 시에도 미선택 시작** + 단일 `480×296` / 다중 **2열 `458×286` `1.6:1` 신용카드 직사각형 비율** · `30px` 상품명 · `25px` 잔여 가치 · `3단 정형 스노우 푸터` · `LESSON` 오차감 및 기소진 0회권 차단 + **1단계 미선택 카드 유리 광택 스윕(`asset-card-pulse-hint`) ➔ 2단계 카드 선택 즉시 하단 `108px` 확정 CTA 루미너스 비콘(`asset-cta-ready`) 바통 터치** + `44px` 최종 타석·시간 독)로 일원화하며, `AllocationCompleteModal.tsx`는 **`920px` 디지털 배정표** + 풀와이드 **`96px` 단일 `[확인]` 버튼**으로 마감합니다(`Why`: 배정표는 모달 오픈 시 자동 인쇄되며, 용지 소진·재출력 대응은 프런트포스 전담이므로 키오스크 불필요 `[영수증 재출력]` 버튼을 제거해 오터치와 감열지 중복 낭비를 차단).
- **내부 콘텐츠 패널 높이 단일화 (Uniform 750px Workspace)**:
  - 스마트 태그(`SMART_TAG`), 전화번호 키패드(`PHONE_KEYPAD`), 안면 인식(`FACE`), QR 스캔(`QR_SCAN`) 4대 인증 탭의 내부 작업 공간 높이를 **`height: 750px` (minHeight: 750px)**로 100% 일원화.
- **전화번호 3×4 키패드 황금비율 복원 (+44% 수직 확장)**:
  - 숫자 키패드 버튼: `height: 68px` ➔ **`height: 98px` (+44% 확장)**.
  - 가로:세로 종횡비: 기존 납작한 4:1 호떡 형태에서 **2.73:1 두툼한 터치 캡슐**로 완전 복원.
  - 폰트 크기: 숫자 `30px ➔ 36px`, C/DEL `20px ➔ 24px` UltraBold.
  - 번호 디스플레이: `height: 84px ➔ 100px`, 폰트 `34px ➔ 42px` 등폭 숫자(`tabular-nums`).
  - 메인 조회 버튼: `height: 68px ➔ 84px`, 폰트 `22px ➔ 26px` UltraBold.
- **앱 스마트 체크인 패널 (NFC 완전 배제 및 모바일 앱 2-Step 가이드)**:
  - 오프라인 하드웨어 리더기 태그(NFC) 안내 및 접촉 문구를 100% 완전 제거.
  - 기종 무관(Android / iPhone 공통) 앱 스마트 체크인 2단계 원터치 가이드 구축:
    - `STEP 1 [📱 골포스 앱 실행]`: 스마트폰에서 골포스(GOLFOS) 앱을 실행해 주세요.
    - `STEP 2 [⚡ [스마트 체크인] 터치]`: 홈 화면 상단의 [스마트 체크인] 버튼을 누르면 즉시 무선 인식됩니다.
    - 안심 팁 캡슐: `"💡 키오스크 기기에 스마트폰을 대지 않아도 무선으로 안전하게 자동 인식됩니다."`
  - 중앙 비주얼: 140px 딥 포레스트 그린 배지 내 스마트폰 아이콘 유지, 탭 전환 시 750px 고정 워크스페이스 유지.
- **안면 인식 패널 시각적 밸런스**:
  - 뷰포트 높이 `560px` 대형화로 27인치 세로형 FHD 공간 완전 장악.

---

## 변경 이력 (Revision History)

| 일자 | 버전 | 변경 구분 | 핵심 변경 요약 |
| :--- | :--- | :--- | :--- |
| 2026-11-14 | v9.3 | 배정 퍼널 Apple HIG 1.6:1 직사각형 카드 & 2단 시선 릴레이 CTA 비콘 마감 | `TimeMaster.buildBayAllocationPreview` 전 퍼널 `즉시 배정`(에메랄드 `#059669`) vs `대기 예약`(앰버 `#d97706`) 이원화, AI `Sparkles`·`VIP PASS`/`EMV Chip`·`1단계`·이모지 전면 제거, `PracticeSelect` `960px` 2열 `nowrap` 모달(`Touch :`·중복 경고 제거, `72px` 버튼), `MemberAuth` `920px` 이름 확인(이용권 선택 전 `HH:mm 즉시 시작`/`HH:mm 대기 시작`만 표출, `96px` 버튼), `AssetSelectModal` `1,008px`(1장 보유 포함 전 권종 미선택 시작 · 단일 `480×296`/다중 2열 `458×286` `1.6:1` 카드 · 1단계 `asset-card-pulse-hint` 유리 광택 ➔ 2단계 `.asset-cta-ready` 스프링 팝인·헤일로 펄스·유리 광택 스윕·화살표 넛지 `108px` CTA 비콘 · `LESSON` 제외 및 `DAILY`/`TICKET` 0회 소진 차단), `AllocationCompleteModal` `920px` 대형 배정표(`floor ?? floor_no` + `84px` 타석번호 · `44px`/`40px` 시간 · `[영수증 재출력]` 제거 후 풀와이드 단일 `96px` `[확인]` 버튼) 및 `electron/main.cjs` 모니터 배율 자동 맞춤 완료 |
| 2026-10-30 | v9.0 | 모바일 앱 스마트 체크인 | `MemberAuth.tsx`, `KioskSettingsModal.tsx` NFC 태그 안내 전면 제거 및 `앱 스마트 체크인` 2-Step 무선 가이드·750px 워크스페이스 일원화 |
| 2026-10-29 | v8.9 | 크리스탈 라이트 블러 & 펄스 | `TopTeeboxDashboard.tsx`, `PracticeSelect.tsx`, `MemberAuth.tsx` 3px 라이트 블러 투과(딤 38%) · 선택 타석 블루 펄스 · 27인치 FHD 스케일업 및 98px 키패드/Zero Layout Shift 정비 (`v6.2~v8.8` 누적 반영 포함) |
| 2026-10-28 | v6.0 | 애플 미니멀 표준 제정 | `IntroScreen.tsx`~`AllocationCompleteModal.tsx` 순백색 스노우 화이트(`#ffffff`), `#1d1d1f` 딥 차콜 999px 필 버튼, 5% 인디케이터 닷 및 100% 한글 티켓 표준 확립 |
