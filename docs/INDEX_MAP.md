# 🗺️ LocalMaster Kiosk (`LocalMaster_Kiosk`) 단일 진실 공급원(SSOT) 맵

> **최종 동기화 일자**: 2026-10-29
> **포트 규약**: `Port 5179` (Vite React + TypeScript + Electron/Windows Hardware Bridge)
> **역할**: 무인 타석 배정, 예약 체크인, 30초 회원가입, 상품 구매, 라카 연장, 타석 이동, 다중 사업자 VAN 결제 및 서멀 인쇄 키오스크

---

## 1. 📚 핵심 시스템 마스터 명세서 (SSOT Documents)

| 문서명 | 위치 | 설명 |
| :--- | :--- | :--- |
| 🤖 **무인 키오스크 총괄 허브** | [kiosk_master.md](file:///Users/sgmnljs/workspace/Python/docs/domains/kiosk_master.md) | 키오스크 전체 아키텍처, 5대 서브 마스터 색인, API 카탈로그, 8대 골든 패스 E2E 규약 |
| ⛳ **1. 타석 배정 & 이동 마스터** | [kiosk_allocation_master.md](file:///Users/sgmnljs/workspace/Python/docs/domains/kiosk/kiosk_allocation_master.md) | 비관적 선점 락, 단일/연쇄 배정, 순수 컬러 코딩 현황표, 마감 단축, 동반자, 파3, 셀프 이동 |
| 👤 **2. 회원 인증 & 신규가입 마스터** | [kiosk_auth_master.md](file:///Users/sgmnljs/workspace/Python/docs/domains/kiosk/kiosk_auth_master.md) | 4대 인증 채널(스마트태그/안면/키패드/QR), 30초 신규가입, 한글 오토마타, 가상 키보드 |
| 🎟️ **3. 당일 상시 체크인 마스터** | [kiosk_checkin_master.md](file:///Users/sgmnljs/workspace/Python/docs/domains/kiosk/kiosk_checkin_master.md) | 사전예약 당일 체크인 2-Track(얼리/정시 가동), 미결제 배제, 배정표 재출력, 대기 보호 |
| 💳 **4. VAN 결제 & 매대 마스터** | [kiosk_payment_master.md](file:///Users/sgmnljs/workspace/Python/docs/domains/kiosk/kiosk_payment_master.md) | 다중 TID 라우팅, 할부 개월, 0원 무카드, 상품 매대, 라카 연장, 2PC 자동 망취소/DLQ |
| 🖨️ **5. 하드웨어 & 관리자 마스터** | [kiosk_hardware_master.md](file:///Users/sgmnljs/workspace/Python/docs/domains/kiosk/kiosk_hardware_master.md) | 내장 시리얼 서멀 프린터(HKP-300 COM5), 영수증/배정표/라카확인증 3단 분리, 5-Tap 관리자 모드, 기기설정 DB 보존, 블랙박스 로깅, 4중 세션 보안 |
| 🎨 **6. 화면별 UI & 인터랙션 규격** | [kiosk_ui_master.md](file:///Users/sgmnljs/workspace/Python/docs/domains/kiosk/kiosk_ui_master.md) | 27인치 세로형 FHD 레이아웃, 화면 흐름도, 9대 화면별 와이어프레임 및 UI 절대 가드레일 |
| 🍏 **키오스크 표준 디자인 규약** | [kiosk_design_system_master.md](file:///Users/sgmnljs/workspace/Python/LocalMaster_Kiosk/docs/kiosk_design_system_master.md) | 애플 미니멀 럭셔리 스타일 (White/Charcoal, Pill Button, 5% Indicator) 전역 규약 |

---

## 2. 🎨 키오스크 화면 및 핵심 모듈 라우팅 맵 (`src/`)

- **`KioskApp.tsx`**: 최상위 상태 머신 오케스트레이터 (세션 타임아웃/잠금 해제, VAN 실패 시 자동 망취소 `executeAutoReversal` 및 DLQ 보고 `reportGhostCharge`, 타석 배정/구매/라카연장 제어, 중간 빈타석 가용시간 사전 점검, 마감 단축 모달 `closingPromptModal`)
- **`components/IntroScreen.tsx`**: 메인 대기 화면 (실시간 층별 타석 현황 위젯 및 터치 진입)
- **`components/MainPage/KioskMainDashboard.tsx`**: 7대 표준 기능(예약 체크인, 연습타석 배정, 파3 배정, 상품 구매, 라카 연장, 타석 이동, 회원가입) 27인치 고시인성 대형 타이포 및 풀와이드 필 버튼 메인 허브
- **`components/TopTeeboxDashboard.tsx` & `MiniTeeboxMonitor.tsx`**: 실제 매장 `floor_no`/`zone_code` 기반 자동 반응형 그리드(`AUTO`: 12석 이하 1줄 대형 / 13석+ 2줄 균등 배분, `COMPACT_1ROW`, `HIDDEN`) 층별 타석 현황판 및 미니 모니터
- **`components/MemberAuth.tsx`**: 휴대폰 뒷번호(하이픈 정규화 매칭 및 4자리 중복 시 409 안내) / 전체번호 / QR·바코드 / 스마트태그(`authenticateSmartTag`, 본인 확인 모달 레이스 컨디션 방어 `detectedMemberRef`) 회원 인증, 디버그 시뮬레이터 더미 칩 완전 제거 및 실물 기기/실제 DB 인증 일원화
- **`components/MemberRegister.tsx` & `VirtualKeyboard.tsx`**: 30초 즉석 신규 회원가입 (`backdropFilter` 외부 레이어 격리 및 입력창 비침범 하방 앵커링 `computeVirtualKeyboardTop`, 실시간 타이핑 미리보기 바·초기화 내장 한글 두벌식 오토마타 `VirtualKeyboard.tsx`, 약관 동의, 안면인식 캡처 연동)
- **`components/CheckinSelect.tsx`**: 당일 예약 내역 조회 및 당일 상시 체크인(시작 시각 전 얼리 체크인 `CHK` 확정 & 정시 자동 기동 예약, 시작 시각 도래 시 즉시 `CoreEngine.check_in_and_start` 물리 타석 기동)
- **`components/PracticeSelect.tsx` & `TeeboxMap.tsx` & `TeeboxTileCard.tsx`**: 층별 타석 맵 및 셀프 타석 이동 TeeboxTileCard SSOT 일원화, 내 타석 에메랄드 보전, 잔여시간/진행바 온전 가시화, 미보유 전용 뷰 및 수직 중앙 플로팅
- **`components/AssetSelectModal.tsx`**: 보유 이용권 선택 모달 (실제 신용카드 황금비 1.58:1 가로 2열 나란히 덱, 플래티넘 스마트 IC 칩, 1회 배정시간 뱃지, 한글 유효기간 풀 표기, [✔ 선택됨] 에메랄드 림)
- **`components/CompanionSetupModal.tsx` & `ChainedBookingModal.tsx`**: 그룹 동반자(대표자 횟수권 잔여 횟수 초과 중복 배정 차단 vs 일일권 결제) 설정 및 연속 예약(Chained Booking)
- **`components/Par3Allocation.tsx`**: 파3 코스/티타임 선택, 보유 이용권 실시간 차감, 5만원 이상 카드 할부 선택 및 웹훅 실패 시 VAN 자동 망취소/DLQ 연동
- **`components/ProductShop.tsx`**: 일일 타석권 및 회원 전용 이용권 매대 (샴페인 플래티넘 스마트 IC 칩, 1회 배정시간 시그니처 뱃지, 1열 혜택 라인, 하단바 간섭 방지 140px 마진, 시간 초과 비활성화 가드)
- **`components/LockerExtend.tsx`**: 본인 보유 라카 기간 연장(선점 `holdLockerExtension`) 및 미보유 전용 풀와이드 Empty View(23px 안내문), 20px~23px 고시인성 타이포 및 27인치 수직 중앙 밸런스 플로팅
- **`components/PaymentTerminal.tsx`**: 애플 미니멀 중앙 플로팅 시트(27인치 세로형), 2-Step 결제 확인, 비회원➔회원 인증 전환(`인증 완료` 에메랄드 배지), 5만원 이상 할부 선택, 다중 사업자 TID 라우팅 및 쿠폰/포인트 정산
- **`components/AllocationCompleteModal.tsx` & `PurchaseCompleteModal.tsx` & `ReceiptPrinter.tsx`**: 영수증/타석배정표/라카확인증 3단 분리 서멀 인쇄 (`kioskSlipPrinter.ts`, FIFO 직렬화 큐 및 중복 인쇄 방지)
- **`components/AdminPinModal.tsx` & `KioskSettingsModal.tsx` & `MaintenanceOverlay.tsx`**: 관리자 PIN(커스텀 및 마스터 PIN 수용, 물리 키보드 지원, zIndex 100005) 및 기기별 메뉴·인증수단·VAN 단말기 설정 모달
- **`hooks/useKioskHardwareHeartbeat.ts` & `services/hardware/hooks/useHardwareScanner.ts`**: 단말기 하드웨어 헬스 하트비트 보고 및 USB HID/브릿지 바코드·QR 스캐너 통합 훅
