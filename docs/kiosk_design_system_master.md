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
  - 모든 메인 액션 버튼(결제하기, 배정하기, 확인 등)은 **완전 원형 필 버튼 (`borderRadius: 999px`, `height: 56px` ~ `64px`)**으로 통일합니다.
- **버튼 컬러 스킴**:
  - 화이트 배경 카드: **애플 딥 차콜 필 버튼 (`background: #1d1d1f`, `color: #ffffff`)**
  - 다크 프로스트 카드: **애플 스노우 화이트 필 버튼 (`background: #ffffff`, `color: #000000`)**
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
- **본인 인증(MemberAuth) 모달 2중 안심 배지 (Double Assurance Badge)**:
  - 타석 배정 목적(`ALLOCATE_MEMBERSHIP`, `ALLOCATE_DAILY`)으로 인증 시, 모달 헤더 `회원 본인 인증` 타이틀 바로 옆에 **`[ ⛳ {NN}번 타석 배정 ]`** 블루 필 뱃지(`rgba(0, 113, 227, 0.08)`, `border: 1.5px solid rgba(0, 113, 227, 0.35)`)를 상시 표출하여 고객이 2중으로 확실하게 인지하도록 보장합니다.
- **카드 외곽 및 위치 고정 (Top Y Anchor)**:
  - 외부 오버레이 컨테이너: `justifyContent: 'flex-start'`, `paddingTop: '180px'`.
  - 모달 카드 치수: **`width: 1,000px` × `height: 1,040px` (minHeight: 1,040px 고정)**.
  - 상단 Y좌표(Top Y)가 `180.00px`에 절대 고정되어 탭 전환이나 키패드 터치 시 **상하 들썩임(Layout Shift) 편차 0.0000px** 보장.
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

## 📜 변경 이력 및 적용 완료 현황
- **`IntroScreen.tsx`**: GOLF CLUB 상단 대형 실시간 타석 현황 위젯 스케일업.
- **`PracticeSelect.tsx`**: 타석 배정 방식 선택 모달 원색 제거 및 애플 화이트/차콜 리뉴얼.
- **`AllocationCompleteModal.tsx`**: 100% 한글 애플 스노우 화이트 타석 배정표 디지털 티켓 구축.
- **`ProductShop.tsx`**: 일일 타석권 상품별 BEST 뱃지, 48px 대형 숫자, 애플 딥 차콜 필 결제 버튼 반영.
- **`PaymentTerminal.tsx`**: 군더더기 줄글/과장 안내문 전면 삭제, 담백한 `[👤 회원 인증 / 로그인]` 단일 버튼 및 실보유 혜택 한정 표출, 하단 플로팅 네비게이션 충돌 원천 차단 및 컴팩트 4-Zone 결제 독 구축.
- **`PaymentTerminal.tsx (v6.2)`**: 애플 미니멀 중앙 플로팅 시트 리뉴얼 (`maxWidth: 860px`, `borderRadius: 32px`, 원색 도배 90% 제거, 고대비 모노톤 SF Pro 딥 블랙 `#1d1d1f` 및 애플 딥 차콜 완전 원형 `999px` 필 버튼 전역 통일).
- **`PaymentTerminal.tsx (v6.3)`**: 27인치 대형 화면 황금 비례 스케일업 (`maxWidth: 940px`, `padding: 44px 48px`, 48px 대형 금액 타이포, 76px 시그니처 딥 차콜 필 버튼, ProductShop과 100% 비례 통일).
- **`CheckinSelect.tsx & TeeboxMap.tsx (v6.5)`**: 당일 사전 예약 체크인 화면 및 셀프 타석 이동 화면의 구형 다크 그린/네온 인디고 테마를 전면 폐기하고, 애플 스노우 화이트 글래스 카드(`#ffffff`), `#f5f5f7` 서브 패널, `#1d1d1f` 시그니처 원형 필 버튼으로 리뉴얼 완료 (전역 `KioskBottomBar`와 중복되던 내부 취소/이전 버튼 정리).
- **`VirtualKeyboard.tsx, ProductShop.tsx, Par3Allocation.tsx & PurchaseCompleteModal.tsx (v6.6)`**: 즉석 회원가입용 가상 키보드의 다크 네온 인디고 테마를 폐기하고 스노우 화이트(`#ffffff` / `#f5f5f7` 키캡)로 전환했으며, 회원권 매대 카테고리 세그먼트 컨트롤, 파3 라운딩 예약 버튼/모달, 구매 완료 확인 버튼까지 모두 `#1d1d1f` 딥 차콜 원형 필(Pill) 스타일로 100% 일원화 완료.
- **`ErrorMessageModal.tsx, CompanionSetupModal.tsx, MaintenanceOverlay.tsx, ReceiptPrinter.tsx & KioskApp.tsx Fail-Safe Modals (v6.7)`**: 에러 안내 팝업, 네트워크/미들웨어 단절 차단 모달, 마감 단축 배정 모달, 동반자 다중 배정 설정창, 시스템 점검 오버레이, 영수증 인쇄 확인 버튼까지 모든 예외·안전망 화면을 스노우 화이트(`#ffffff` / `#f5f5f7`)와 `#1d1d1f` 딥 차콜 필 버튼으로 100% 일원화 완료.
- **`KioskMainDashboard.tsx, TopTeeboxDashboard.tsx & kiosk_design_system.css (v7.5)`**: 27인치 Windows 키오스크(`1080×1920`) 고시인성 타이포그래피 전면 확대(헤드라인 `46px`, 히어로 타이틀 `40px`/버튼 `62px`, 서브카드 타이틀 `34px`/풀와이드 필 버튼 `56px` 통일, 회원가입 타이틀 `30px`/버튼 `62px`), Windows ClearType 한글 가독성 최적화(`'Pretendard Variable', 'Pretendard', 'Segoe UI', 'Malgun Gothic'`, `fontWeight: 800`, 단위 없는 `line-height: 1.4`), 상단 타석 현황판 자동 반응형 그리드(`AUTO`: 12석 이하 1줄 대형 와이드 `62px` / 13석 이상 2줄 균등 배분 `54px`) 및 가맹점 커스터마이징(`topDashboardMode`) 구축 완료.
- **`LockerExtend.tsx (v8.0)`**: 개인 라카 연장 화면 27인치 세로형 FHD(`1080×1920`) 고시인성 전면 개편. 수직 중앙 플로팅 밸런스로 하단 여백 과다 해소, 라카 미보유 회원 전용 풀와이드 Empty 안내 뷰(타이틀 `32px`, 설명문 `23px` line-height 1.75 고대비 차콜, `기간 연장만` 블루/`안내 데스크` 오렌지 하이라이트, `22px` 대형 원형 필 버튼), 상단 파란색 안내 박스(`20px`), 라카 번호 배지(`74px` / `34px` UltraBold) 및 가격(`38px`) 스케일업 완료.
- **`TeeboxMap.tsx (v8.1)`**: 셀프 타석 이동 화면 27인치 세로형 FHD(`1080×1920`) 고시인성 전면 개편. 수직 중앙 플로팅 밸런스(`flex: 1`, `margin: auto 0`)로 하단 600px 빈 여백 해소, 타석 미보유 전용 Full-Width Empty 안내 뷰(타이틀 `32px`, 설명문 `23px` 3줄 고대비 차콜, `연습타석 배정하기` `22px` 에메랄드 필 버튼 원터치 연결), 상단 현재 타석 바 `32px` UltraBold 및 UTC ISO 시각 버그 KST 정규화(`HH:mm 종료`), 하단 [타석 이동 확정] 메인 CTA 버튼 `68px` / `22px` UltraBold 스케일업 완료.
- **`TeeboxTileCard.tsx & TeeboxMap.tsx (v8.2)`**: 타석 이동 화면 타석 그리드를 공용 `TeeboxTileCard` 단일 진실 공급원(SSOT)으로 100% 통합 및 300줄 레거시 중복 코드 완전 제거. `isCurrentMyBay`(현재 내 타석 에메랄드 하이라이트 및 보전 배지), `isMoveMode`(즉시 이동 가능/이동 선택 완료 텍스트 및 사용 중 타석 실시간 잔여시간/진행바 완전 가시화), 사용 중 타석 터치 시 즉시 이동 불가 안내 토스트 및 상단 5대 범례 일원화 완료.
- **`TeeboxTileCard.tsx & TeeboxMap.tsx (v8.3)`**: 27인치 세로형 FHD(`1080×1920`) 텍스트 클리핑 긴급 해소 및 UI 황금비율 최적화. 종횡비 `1 / 1.22` 및 패딩 `13px 11px`로 세로 15px/가로 10px 유효폭 확장, 사용 중 박스 잔여시간(`12px`) 및 예정시각(`11px`) `whiteSpace: nowrap` 강제로 2줄 개행(`남/음`, `예/정`) 및 프로그레스 바 바닥 클리핑 100% 차단, 상단 활성 배너 `whiteSpace: nowrap` 및 `28px` 적용으로 `타/석` 단어 쪼개짐 완전 해소.
- **`MemberRegister.tsx & VirtualKeyboard.tsx (v8.4)`**: 신규 회원가입 창 27인치 세로형 FHD(`1080×1920`) 1.3배 전면 스케일업(`width: 1,000px` × `height: 약 920px` 대형 Bento 글래스 시트). 텐키 숫자 버튼(`68px ➔ 82px` / 폰트 `26px ➔ 32px`), 휴대폰 번호 디스플레이(`68px ➔ 80px` / 폰트 `28px ➔ 34px`), 이름 입력창(`68px ➔ 80px` / 폰트 `20px ➔ 24px`), 성별 버튼(`64px ➔ 76px` / 폰트 `22px`), 전체 약관 동의(`50px ➔ 64px` / 폰트 `18px` / 체크박스 `26px`), 최종 가입 CTA(`72px ➔ 84px` / 폰트 `24px` UltraBold), 2단계 안면등록 뷰파인더(`520×340px ➔ 640×420px`), 가상 키보드 docked width `1,000px` Flush 정합 완료.
- **`TeeboxTileCard.tsx (v8.5)`**: 사용 중 타석 2컬럼 미니 KPI 분할 및 하단 4px 매립 그래프바(Graph Bar) 고시인성 전면 개편. 좌측 `남은 대기 {N}분`(16px 에메랄드)과 우측 `시작 시각 {HH:mm}`(16px 딥 차콜) 2대 핵심 수치를 16px 특대형 UltraBold로 확대(+33%)하고, 하단 바닥면에 4px 일체형 매립 프로그레스 바를 결합하여 글씨 짤림 0% 및 진행률 직관성 극대화 완료. 상단 `● 대기 N명` 뱃지 연동.
- **`MemberAuth.tsx & kiosk_design_system.css (v8.6)`**: 전화번호 인증 키패드 화면 울렁거림(Wobble/Bounce) 0.00px 영구 제거 및 스마트 디스플레이 개편. `.premium-glass-card:active`의 `scale(0.97)` 부모 축소 전파와 `.keypad-num-btn`의 `scale(0.95)` 기하학적 변형을 전면 제거(`transform: none !important`, 솔리드 배경 컬러 `#e2e8f0` 즉시 반응)하고, 번호 표시창을 `84px` 고정 높이·등폭 숫자(`tabular-nums`)로 고정했으며, 뒷번호 4자리(`5678`) 입력 시 하이픈 깨짐(`567-8`) 없이 `5678` + `[뒷 4자리 조회 가능]` 배지로 표출하도록 개선 완료.
- **`MemberAuth.tsx (v8.7)`**: 본인 인증 모달 상단/하단 절대 높이 고정(Zero Layout Shift) 및 키패드 황금비율 전면 개편. 카드 외곽을 `width: 1,000px` × `height: 1,040px`(상단 Top Y 180px 절대 앵커) 및 내부 작업 공간 `height: 750px`로 전 탭 단일화하여 탭 전환 시 높낮이 편차 0.0000px 달성. 3×4 키패드 버튼 높이를 `68px ➔ 98px`로 +44% 대폭 확대하여 기존 납작한 4:1 호떡에서 2.73:1 두툼한 터치 캡슐로 복원 완료.
- **`KioskApp.tsx & MemberAuth.tsx (v8.8)`**: 타석 선택 후 본인인증 모달 오버레이 표준화(`position: fixed; inset: 0; zIndex: 9000; backdropFilter: blur(14px)`) 및 하단 타석현황판 겹침 0% 완전 해소. 배정 퍼널 진행 중 배경 타석 화면이 하단으로 밀려나와 깨지던 아키텍처 결함을 수정하고 애플 럭셔리 다크 글래스 오버레이로 일원화 완료.
- **`TopTeeboxDashboard.tsx, PracticeSelect.tsx, MemberAuth.tsx (v8.9)`**: 방안 2 크리스탈 라이트 블러 투과(`blur(3px)`, 딤 38%) 표준화 및 선택 타석 2중 안심 강조 구축 완료. 상단 전광판 내 선택 타석 블루 펄스 점등(`selectedBayHaloPulse`)과 본인인증 모달 헤더 `[ ⛳ {NN}번 타석 배정 ]` 필 배지 렌더링으로 팝업 중에도 고객의 공간 인지(Spatial Orientation) 100% 완벽 보장.
- **`MemberAuth.tsx, KioskSettingsModal.tsx (v9.0)`**: NFC 방식 및 리더기 접촉 안내 전면 제거, 모바일 앱 '스마트 체크인' 전용 UI 개편 완료. 탭 라벨을 `스마트폰 태그`에서 `앱 스마트 체크인`으로 직관화하고, Android/iOS 구분 없이 `STEP 1 골포스 앱 실행` ➔ `STEP 2 [스마트 체크인] 터치` 2단계 통합 원터치 가이드와 리더기 비접촉 무선 안심 배너 구축 완료.
