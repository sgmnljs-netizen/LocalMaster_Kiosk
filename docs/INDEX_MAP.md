# 🗺️ LocalMaster Kiosk (`LocalMaster_Kiosk`) 단일 진실 공급원(SSOT) 맵

> **최종 동기화 일자**: 2026-11-03
> **포트 규약**: `Port 5179` (Vite React + TypeScript + Electron/Windows Hardware Bridge)
> **역할**: 무인 타석 배정, 예약 체크인, 30초 회원가입, 상품 구매, 라카 연장, 타석 이동, 다중 사업자 VAN 결제 및 서멀 인쇄 키오스크

---

## 1. 📚 핵심 시스템 마스터 명세서 (SSOT Documents)

| 문서명 | 위치 | 설명 |
| :--- | :--- | :--- |
| 🤖 **무인 키오스크 총괄 허브** | [kiosk_master.md](file:///Users/sgmnljs/workspace/Python/docs/domains/kiosk_master.md) | 키오스크 전체 아키텍처, 6대 서브 마스터 색인, API 카탈로그, 8대 골든 패스 E2E 규약 |
| ⛳ **1. 타석 배정 & 이동 마스터** | [kiosk_allocation_master.md](file:///Users/sgmnljs/workspace/Python/docs/domains/kiosk/kiosk_allocation_master.md) | 비관적 선점 락, 단일/연쇄 배정, 순수 컬러 코딩 현황표, 마감 단축, 동반자, 파3, 셀프 이동 |
| 👤 **2. 회원 인증 & 신규가입 마스터** | [kiosk_auth_master.md](file:///Users/sgmnljs/workspace/Python/docs/domains/kiosk/kiosk_auth_master.md) | 4대 인증 채널(스마트태그/안면/키패드/QR), 30초 신규가입, 한글 오토마타, 가상 키보드 |
| 🎟️ **3. 당일 상시 체크인 마스터** | [kiosk_checkin_master.md](file:///Users/sgmnljs/workspace/Python/docs/domains/kiosk/kiosk_checkin_master.md) | 사전예약 당일 체크인 2-Track(얼리/정시 가동), 미결제 배제, 배정표 재출력, 대기 보호 |
| 💳 **4. VAN 결제 & 매대 마스터** | [kiosk_payment_master.md](file:///Users/sgmnljs/workspace/Python/docs/domains/kiosk/kiosk_payment_master.md) | 다중 TID 라우팅, 할부 개월, 0원 무카드, Exception-Only 상품 매대·일일권 사전 가드, 라카 연장, 2PC 망취소/DLQ |
| 🖨️ **5. 하드웨어 & 관리자 마스터** | [kiosk_hardware_master.md](file:///Users/sgmnljs/workspace/Python/docs/domains/kiosk/kiosk_hardware_master.md) | 내장 시리얼 서멀 프린터(HKP-300 COM5), 영수증/배정표/라카확인증 3단 분리, 5-Tap 관리자 모드, 기기설정 DB 보존, 블랙박스 로깅, 4중 세션 보안 |
| 🎨 **6. 화면별 UI & 인터랙션 규격** | [kiosk_ui_master.md](file:///Users/sgmnljs/workspace/Python/docs/domains/kiosk/kiosk_ui_master.md) | 27인치 세로형 FHD 레이아웃, 화면 흐름도, 9대 화면별 와이어프레임 및 UI 절대 가드레일 |
| 🍏 **키오스크 표준 디자인 규약** | [kiosk_design_system_master.md](file:///Users/sgmnljs/workspace/Python/LocalMaster_Kiosk/docs/kiosk_design_system_master.md) | 애플 미니멀 럭셔리 스타일 (White/Charcoal, Pill Button, 5% Indicator) 전역 규약 |

---

## 2. 🎨 키오스크 화면 및 핵심 모듈 라우팅 맵 (`src/`)

- **`KioskApp.tsx`**: 최상위 상태 머신 오케스트레이터 (세션 타임아웃/잠금 해제, 네트워크 단절 모달 인라인 피드백 및 3초 주기 무인 자동 복구, VAN 실패 시 자동 망취소 `executeAutoReversal` 및 DLQ 보고 `reportGhostCharge`, 타석 배정/구매/라카연장 제어, 마감 단축 모달 `closingPromptModal`)
- **`components/IntroScreen.tsx`**: 메인 대기 화면 (실시간 층별 타석 현황 위젯 및 터치 진입)
- **`components/MainPage/KioskMainDashboard.tsx`**: 7대 표준 기능(예약 체크인, 연습타석 배정, 파3 배정, 상품 구매, 라카 연장, 타석 이동, 회원가입) 27인치 고시인성 대형 타이포 및 풀와이드 필 버튼 메인 허브
- **`components/TopTeeboxDashboard.tsx` & `MiniTeeboxMonitor.tsx`**: 실제 매장 `floor_no`/`zone_code` 기반 자동 반응형 그리드(`AUTO`: 12석 이하 1줄 대형 / 13석+ 2줄 균등 배분, `COMPACT_1ROW`, `HIDDEN`) 층별 타석 현황판 및 미니 모니터
- **`components/MemberAuth.tsx`**: `010-` 고정 휴대폰 뒷 8자리 필수 입력(가족 중복 번호 마스킹 후보 선택 `409`) / 전체번호 / QR·바코드 / 스마트태그(`authenticateSmartTag`, 본인 확인 모달 20초 자동 파기 및 레이스 방어) 회원 인증
- **`components/MemberRegister.tsx` & `VirtualKeyboard.tsx`**: 30초 즉석 회원가입 및 4대 다중 모드(`HANGUL_NAME` 두벌식 한글·`COUPON_CODE`·`ASCII_TEXT` URL 칩·`NUMERIC`) 공용 가상 키보드(`computeVirtualKeyboardTop`, 약관 동의, 안면인식 연동)
- **`components/CheckinSelect.tsx`**: 당일 예약 내역 조회 및 당일 상시 체크인(시작 시각 전 얼리 체크인 `CHK` 확정 & 정시 자동 기동 예약, 시작 시각 도래 시 즉시 `CoreEngine.check_in_and_start` 물리 타석 기동)
- **`components/PracticeSelect.tsx` & `TeeboxMap.tsx` & `TeeboxTileCard.tsx`**: 층별 타석 맵 및 셀프 타석 이동 TeeboxTileCard SSOT 일원화, 내 타석 에메랄드 보전, 잔여시간/진행바 온전 가시화, 미보유 전용 뷰 및 수직 중앙 플로팅
- **`components/AssetSelectModal.tsx`**: 보유 이용권 선택 모달 (실제 신용카드 황금비 1.58:1 가로 2열 나란히 덱, 플래티넘 스마트 IC 칩, 1회 배정시간 뱃지, 한글 유효기간 풀 표기, [✔ 선택됨] 에메랄드 림)
- **`components/CompanionSetupModal.tsx` & `ChainedBookingModal.tsx`**: 그룹 동반자(대표자 횟수권 잔여 횟수 초과 중복 배정 차단 vs 일일권 결제) 설정 및 연속 예약(Chained Booking)
- **`components/Par3Allocation.tsx`**: 파3 코스/티타임 선택, 보유 이용권 실시간 차감, 다중 사업자 `resolveTerminalRoute` `422` Fail-Fast 차단, 결제 중 이탈 잠금(`onVanBusyChange`) 및 WAL/망취소/DLQ 연동
- **`components/ProductShop.tsx`**: 일일 타석권 및 회원 이용권 매대 (Exception-Only 유동 제한 칩 `restrictionChips`, 일일권 시간·공휴일·층 불일치 사전 비활성화 가드)
- **`components/LockerExtend.tsx`**: 본인 보유 라카 기간 연장(선점 `holdLockerExtension`) 및 미보유 전용 풀와이드 Empty View(23px 안내문), 20px~23px 고시인성 타이포 및 27인치 수직 중앙 밸런스 플로팅
- **`components/PaymentTerminal.tsx`**: 애플 미니멀 중앙 플로팅 시트, 2-Step 결제 확인, 동적 상품 스펙·조건 1줄 요약(`productSpecSummary`), 5만원 이상 할부, 다중 사업자 TID 라우팅 및 쿠폰/포인트 정산
- **`components/AllocationCompleteModal.tsx` & `PurchaseCompleteModal.tsx` & `ReceiptPrinter.tsx`**: 영수증/타석배정표/라카확인증 3단 분리 서멀 인쇄 (`kioskSlipPrinter.ts`, FIFO 직렬화 큐 및 중복 인쇄 방지)
- **`utils/kioskProductSpecSummary.ts` & `utils/kioskPurchaseEligibility.ts` & `utils/code128Barcode.ts`**: Exception-Only 상품 옵션·제한 조건 요약 및 일일권 사전 자격 판정 엔진, 구매 직후 즉시 배정 CTA 판별, ISO Code128B 바코드 유틸리티
- **`components/AdminPinModal.tsx` & `KioskSettingsModal.tsx` & `MaintenanceOverlay.tsx`**: 서버 검증 관리자/엔지니어 PIN(5회 실패 `429` 잠금), 호기별 설정 분리(`kiosk_device_settings:{device_id}`), 2-Tier LAN 원클릭 부트스트랩, 6종 내장 가상 키보드 및 관리자 전용 키오스크 프로그램 종료(바탕화면 이동)·재실행 제어 모달
- **`hooks/useKioskHardwareHeartbeat.ts` & `services/hardware/hooks/useHardwareScanner.ts`**: 멀티 VAN 상태 경로(`/vcat`·`/nice`·`/smartro`) 및 `:18080/health` `200 DEGRADED` 프린터 헬스 하트비트, USB HID/브릿지 QR 스캐너 통합 훅
