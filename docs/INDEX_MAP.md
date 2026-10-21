# 🗺️ LocalMaster Kiosk (`LocalMaster_Kiosk`) 단일 진실 공급원(SSOT) 맵

> **최종 동기화 일자**: 2026-10-21
> **포트 규약**: `Port 5179` (Vite React + TypeScript + Electron/Windows Hardware Bridge)
> **역할**: 무인 타석 배정(단일/그룹/연속), 파3 코스 배정, 당일 상시 예약 체크인(2-Track 얼리 체크인 & 정시 자동 기동), 30초 신규 회원가입, 회원권/일일권 구매, 라카 연장, 셀프 타석 이동(`POST /api/v1/kiosk/bays/move`) 및 다중 사업자 VAN 카드/바코드/스마트태그 결제 키오스크

---

## 1. 📚 핵심 시스템 마스터 명세서 (SSOT Documents)

| 문서명 | 위치 | 설명 |
| :--- | :--- | :--- |
| 🤖 **무인 키오스크 마스터** | [kiosk_master.md](file:///Users/sgmnljs/workspace/Python/docs/domains/kiosk_master.md) | 키오스크 전체 비즈니스 로직(1차~7차 심층 실사 보완 포함), 다중 사업자 VAN 라우팅, 자동 망취소/DLQ, 8대 골든 패스 E2E 규약 |
| 🍏 **키오스크 표준 디자인 규약** | [kiosk_design_system_master.md](file:///Users/sgmnljs/workspace/Python/LocalMaster_Kiosk/docs/kiosk_design_system_master.md) | 애플 미니멀 럭셔리 스타일 (White/Charcoal, Pill Button, 5% Indicator) 전역 규약 |
| 🖨️ **키오스크 하드웨어 명세** | `docs/hardware/` | 영수증 프린터(ESC/POS), QR/바코드 스캐너, NFC/스마트태그, VCAT 데몬 연동 명세 |

---

## 2. 🎨 키오스크 화면 및 핵심 모듈 라우팅 맵 (`src/`)

- **`KioskApp.tsx`**: 최상위 상태 머신 오케스트레이터 (세션 타임아웃/잠금 해제, VAN 결제 실패 시 자동 망취소 `executeAutoReversal` 및 DLQ 보고 `reportGhostCharge`, 타석 배정/구매/라카연장 원자적 제어, 중간 빈타석 초과 일일권 차단 및 보유 이용권 `ASSET_SELECT` 사전 경고/재인증 없는 다른 타석 선택 복귀, 동반자 유료 결제 시 중간 빈타석 가용시간 사전 점검, 마감 임박 단축 배정 모달 `closingPromptModal`)
- **`components/IntroScreen.tsx`**: 메인 대기 화면 (실시간 층별 타석 현황 위젯 및 터치 진입)
- **`components/MainPage/KioskMainDashboard.tsx`**: 7대 표준 기능(`예약 타석 체크인`, `연습타석 배정`, `파3 코스 배정`, `회원권/상품 구매`, `라카 대여/연장`, `타석 이동`, `신규 회원가입`) 및 동적 커스텀 메뉴 메인 허브
- **`components/TopTeeboxDashboard.tsx` & `MiniTeeboxMonitor.tsx`**: 실제 매장 `floor_no`/`zone_code` 기반 동적 층별 타석 현황판 및 `PREPARE`/`PRE_OCCUPIED`/`MAINTENANCE` 상태 실시간 미니 모니터
- **`components/MemberAuth.tsx`**: 휴대폰 뒷번호(하이픈 정규화 매칭 및 4자리 중복 시 409 안내) / 전체번호 / QR·바코드 / 스마트태그(`authenticateSmartTag`, 본인 확인 모달 레이스 컨디션 방어 `detectedMemberRef`) 회원 인증, 디버그 시뮬레이터 더미 칩 완전 제거 및 실물 기기/실제 DB 인증 일원화
- **`components/MemberRegister.tsx` & `VirtualKeyboard.tsx`**: 30초 즉석 신규 회원가입 (한글 두벌식 오토마타 복모음 역분해 지원 `VirtualKeyboard.tsx`, 약관 동의, 안면인식 캡처 연동, 가입 직후 세션 즉시 파기)
- **`components/CheckinSelect.tsx`**: 당일 예약 내역 조회 및 당일 상시 체크인(시작 시각 전 얼리 체크인 `CHK` 확정 & 정시 자동 기동 예약, 시작 시각 도래 시 즉시 `CoreEngine.check_in_and_start` 물리 타석 기동)
- **`components/PracticeSelect.tsx` & `TeeboxMap.tsx` & `TeeboxTileCard.tsx`**: 층별/구역별(`selectedZoneIds`) 타석 맵, 타석 타일 2줄 일원화(`N분 남음` + `HH:mm 빈타석 예정`), 중간 빈타석 대기시간 양방향 이격 및 스마트 갭 병합, 배정방식 선택 모달 가용시간(`max_assignable_min`) 표출, 점검/비활성/버퍼 타석 터치 원천 차단, 단일/그룹 배정 및 셀프 타석 이동(`POST /api/v1/kiosk/bays/move`)
- **`components/CompanionSetupModal.tsx` & `ChainedBookingModal.tsx`**: 그룹 동반자(대표자 횟수권 잔여 횟수 초과 중복 배정 차단 vs 일일권 결제) 설정 및 연속 예약(Chained Booking)
- **`components/Par3Allocation.tsx`**: 파3 코스/티타임 선택, 보유 이용권 실시간 차감, 5만원 이상 카드 할부 선택 및 웹훅 실패 시 VAN 자동 망취소/DLQ 연동
- **`components/ProductShop.tsx`**: 일일 타석권 및 회원 전용 이용권 매대 (중간 빈타석 가용시간 초과 일일권 상품 비활성화 및 비회원 회원권 구매 선제 차단)
- **`components/LockerExtend.tsx`**: 본인 보유 라카(`locker_id` 매핑) 기간 연장 상품 선택(`days > 0` 필터링) 및 선점(`holdLockerExtension`)
- **`components/PaymentTerminal.tsx`**: 애플 미니멀 중앙 플로팅 시트(27인치 세로형), 2-Step 결제 확인, 비회원➔회원 인증 전환, 5만원 이상 할부 선택, 다중 사업자 TID 라우팅 및 쿠폰/포인트 정산
- **`components/AllocationCompleteModal.tsx` & `PurchaseCompleteModal.tsx` & `ReceiptPrinter.tsx`**: 실제 매장 사업자 정보(`biz_no`, `ceo_name`) 및 카드 승인정보 기반 ESC/POS 실물 영수증/배정표 출력 (`hasAutoPrintedRef` 중복 인쇄 방지 가드 탑재)
- **`components/AdminPinModal.tsx` & `KioskSettingsModal.tsx` & `MaintenanceOverlay.tsx`**: 관리자 PIN(동적 `admin_pin` 검증 및 5회 오입력 30초 잠금), 상단 고정(Top-Anchored) 레이아웃(`alignItems: 'flex-start'`, `paddingTop: '9vh'`, `flexShrink: 0`) 및 프리미엄 라이트 테마(`#ffffff`/`#f8fafc`/`#10b981`) 리뉴얼, 7대 메뉴 2열 고밀도 그리드, 중간 빈타석 표시 기준 시간(`minGapMinutes`), 동적 매장코드(`storeCode`)/단말기(`deviceId`)/5대 멀티 VAN/VCAT 포트 실시간 설정(`kiosk-settings-changed` 이벤트 발행)
- **`hooks/useKioskHardwareHeartbeat.ts` & `services/hardware/hooks/useHardwareScanner.ts`**: 단말기 하드웨어 헬스 하트비트 보고 및 USB HID/브릿지 바코드·QR 스캐너 통합 훅
