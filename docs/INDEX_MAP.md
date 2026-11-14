# 🗺️ LocalMaster Kiosk (`LocalMaster_Kiosk`) 단일 진실 공급원(SSOT) 맵

> **최종 동기화 일자**: 2026-11-14
> **포트 규약**: `Port 5179` (Vite React + TypeScript + Electron/Windows Hardware Bridge)
> **역할**: 무인 타석 배정, 예약 체크인, 30초 회원가입, 상품 구매, 라카 연장, 타석 이동, 다중 사업자 VAN 결제 및 서멀 인쇄 키오스크 (Vitest 93개 파일 573 passed / 8대 골든 패스 E2E 100% 통과)

---

## 1. 📚 핵심 시스템 마스터 명세서 (SSOT Documents)

| 문서명 | 위치 | 설명 |
| :--- | :--- | :--- |
| 🤖 **무인 키오스크 총괄 허브** | [kiosk_master.md](file:///Users/sgmnljs/workspace/Python/docs/domains/kiosk_master.md) | 키오스크 전체 아키텍처, 6대 서브 마스터 색인, API 카탈로그, 8대 골든 패스 E2E 규약 |
| ⛳ **1. 타석 배정 & 이동 마스터** | [kiosk_allocation_master.md](file:///Users/sgmnljs/workspace/Python/docs/domains/kiosk/kiosk_allocation_master.md) | 비관적 선점 락·거절사유 원문, 단일/연쇄 배정, 운영시간 사전가드·마감 단축, 동반자, 파3, 셀프 이동 |
| 👤 **2. 회원 인증 & 신규가입 마스터** | [kiosk_auth_master.md](file:///Users/sgmnljs/workspace/Python/docs/domains/kiosk/kiosk_auth_master.md) | 4대 인증 채널(스마트태그/안면/키패드/QR), 30초 신규가입, 한글 오토마타, 가상 키보드 |
| 🎟️ **3. 당일 상시 체크인 마스터** | [kiosk_checkin_master.md](file:///Users/sgmnljs/workspace/Python/docs/domains/kiosk/kiosk_checkin_master.md) | 사전예약 당일 체크인 2-Track(얼리/정시 가동), 미결제 배제, 배정표 재출력, 대기 보호 |
| 💳 **4. VAN 결제 & 매대 마스터** | [kiosk_payment_master.md](file:///Users/sgmnljs/workspace/Python/docs/domains/kiosk/kiosk_payment_master.md) | 다중 TID 라우팅, 할부 개월, 0원 무카드, Exception-Only 상품 매대·일일권 사전 가드, 라카 연장, 2PC 망취소/DLQ |
| 🖨️ **5. 하드웨어 & 관리자 마스터** | [kiosk_hardware_master.md](file:///Users/sgmnljs/workspace/Python/docs/domains/kiosk/kiosk_hardware_master.md) | 내장 시리얼 서멀 프린터(HKP-300 COM5), 영수증/배정표/라카확인증 3단 분리, 5-Tap 관리자 모드, 기기설정 DB 보존, 블랙박스 로깅, 4중 세션 보안 |
| 🎨 **6. 화면별 UI & 인터랙션 규격** | [kiosk_ui_master.md](file:///Users/sgmnljs/workspace/Python/docs/domains/kiosk/kiosk_ui_master.md) | 27인치 세로형 FHD 레이아웃, 화면 흐름도, 9대 화면별 와이어프레임 및 UI 절대 가드레일 |
| 🍏 **키오스크 표준 디자인 규약** | [kiosk_design_system_master.md](file:///Users/sgmnljs/workspace/Python/LocalMaster_Kiosk/docs/kiosk_design_system_master.md) | 애플 미니멀 럭셔리 스타일 (White/Charcoal, Pill Button, 5% Indicator) 전역 규약 |

---

## 2. 🎨 키오스크 화면 및 핵심 모듈 라우팅 맵 (`src/`)

- **`KioskApp.tsx`**: 최상위 상태 머신 오케스트레이터 (세션/네트워크 자동 복구, VAN 2PC 망취소·DLQ, 배정·구매·라카연장 제어)
- **`components/IntroScreen.tsx`**: 메인 대기 화면 (실시간 층별 타석 현황 위젯 및 터치 진입)
- **`components/MainPage/KioskMainDashboard.tsx`**: 7대 표준 기능(체크인·타석배정·파3·상품구매·라카연장·타석이동·회원가입) 27인치 메인 허브
- **`components/TopTeeboxDashboard.tsx` & `MiniTeeboxMonitor.tsx` & `KioskLiveClock.tsx` & `utils/floorUtils.ts` & `utils/timeMaster.ts`**: 물리 층 내림차순 타석 현황판, KST 시계 및 운영시간·마감 잔여분(`evaluateStoreOperatingWindow`) 산출
- **`components/MemberAuth.tsx`**: 휴대폰 뒷 8자리(`010-` 고정) / 쿠폰전용 QR(`qrCouponOnlyMode` & 라카·구매 비노출) / 무선 스마트 체크인 / 안면인식 회원 인증
- **`components/MemberRegister.tsx` & `VirtualKeyboard.tsx`**: 30초 즉석 회원가입 및 4대 모드(`HANGUL_NAME`·`COUPON_CODE`·`ASCII_TEXT`·`NUMERIC`) 가상 키보드
- **`components/CheckinSelect.tsx`**: 당일 예약 조회 및 2-Track 상시 체크인(얼리 체크인 `CHK` & 정시 물리 타석 기동)
- **`components/PracticeSelect.tsx` & `TeeboxMap.tsx` & `TeeboxTileCard.tsx` & `utils/bayStatusGuard.ts`**: 층별 타석 배정 및 셀프 이동 맵, `isBayTrulyAvailableForKiosk` 가용 필터 및 선점 거절 원문(`resolvePreoccupyFailureMessage`) 표출
- **`components/AssetSelectModal.tsx`**: 보유 이용권 선택 모달 (1.6:1 카드, 1장 미선택 시작·2단 시선 릴레이 CTA 비콘, `LESSON`·기소진권 차단, `evaluateAssetFloorMismatchReason`)
- **`components/CompanionSetupModal.tsx` & `ChainedBookingModal.tsx`**: 동반자 다중 타석(최대 4석, 횟수권/일일권) 설정 및 연쇄 대기 예약
- **`components/Par3Allocation.tsx`**: 파3 코스/티타임 선택, 보유 이용권 차감, 서브 사업자 TID 라우팅 및 WAL/망취소/DLQ 연동
- **`components/ProductShop.tsx`**: 일일 타석권 및 회원 이용권 매대 (`restrictionChips` 유동 칩 및 일일권 사전 자격 가드)
- **`components/LockerExtend.tsx`**: 본인 보유 라카 기간 연장(`holdLockerExtension`) 및 미보유 전용 Empty View
- **`components/PaymentTerminal.tsx` & `services/paymentResilience.ts`**: 2-Step 결제 시트, 5만원 이상 할부, 서브 TID 라우팅, 시도별 멱등키(`buildAttemptIdempotencyKey`), Outbox WAL/DLQ
- **`components/AllocationCompleteModal.tsx` & `PurchaseCompleteModal.tsx` & `ReceiptPrinter.tsx`**: 영수증/타석배정표/라카확인증 3단 분리 서멀 인쇄 (`kioskSlipPrinter.ts`, FIFO 큐)
- **`utils/kioskProductSpecSummary.ts` & `utils/kioskPurchaseEligibility.ts` & `utils/code128Barcode.ts` & `utils/kioskBlackBox.ts`**: 상품 스펙 요약·자격 판정 엔진, ISO Code128B 바코드, PAN 마스킹 블랙박스 로거
- **`components/AdminPinModal.tsx` & `KioskSettingsModal.tsx` & `hooks/useHiddenAdminTrigger.ts` & `stores/kioskSettings.ts`**: 서버 검증 관리자/엔지니어 PIN, 5-Tap 히든 트리거, 호기별 설정 분리, `X-Device-Key` 기기인증 및 앱 제어
- **`hooks/useKioskHardwareHeartbeat.ts` & `stores/useKioskHardwareHealthStore.ts` & `hooks/useKioskVanPayment.ts`**: 멀티 VAN·프린터 헬스 하트비트 스토어, VAN 결제 `E_BUSY` 잠금 및 QR 스캐너(`useHardwareScanner.ts`) 훅
- **`electron/main.cjs`**: 24/7 무인 키오스크 데스크톱 셸 (모니터 배율 자동 맞춤 `applyMonitorZoomFit`, LAN PNA 해제, 크래시/오프라인 자동 복구)
