# 🗺️ LocalMaster Kiosk (`LocalMaster_Kiosk`) 단일 진실 공급원(SSOT) 맵

> **최종 동기화 일자**: 2026-10-16
> **포트 규약**: `Port 5179` (Vite React + TypeScript + Electron/Windows Hardware Bridge)
> **역할**: 무인 타석 배정(단일/그룹/연속), 파3 코스 배정, 실시간 예약 체크인, 30초 신규 회원가입, 회원권/일일권 구매, 라카 연장, 타석 이동 및 다중 사업자 VAN 카드/바코드/스마트태그 결제 키오스크

---

## 1. 📚 핵심 시스템 마스터 명세서 (SSOT Documents)

| 문서명 | 위치 | 설명 |
| :--- | :--- | :--- |
| 🤖 **무인 키오스크 마스터** | [kiosk_master.md](file:///Users/sgmnljs/workspace/Python/docs/domains/kiosk_master.md) | 키오스크 전체 비즈니스 로직, 다중 사업자 VAN 라우팅, 자동 망취소/DLQ, 6대 골든 패스 E2E 규약 |
| 🍏 **키오스크 표준 디자인 규약** | [kiosk_design_system_master.md](file:///Users/sgmnljs/workspace/Python/LocalMaster_Kiosk/docs/kiosk_design_system_master.md) | 애플 미니멀 럭셔리 스타일 (White/Charcoal, Pill Button, 5% Indicator) 전역 규약 |
| 🖨️ **키오스크 하드웨어 명세** | `docs/hardware/` | 영수증 프린터(ESC/POS), QR/바코드 스캐너, NFC/스마트태그, VCAT 데몬 연동 명세 |

---

## 2. 🎨 키오스크 화면 및 핵심 모듈 라우팅 맵 (`src/`)

- **`KioskApp.tsx`**: 최상위 상태 머신 오케스트레이터 (세션 타임아웃/잠금 해제, VAN 결제 실패 시 자동 망취소 `executeAutoReversal` 및 DLQ 보고 `reportGhostCharge`, 타석 배정/구매/라카연장 원자적 제어)
- **`components/IntroScreen.tsx`**: 메인 대기 화면 (실시간 층별 타석 현황 위젯 및 터치 진입)
- **`components/MainPage/KioskMainDashboard.tsx`**: 5대 표준 메뉴(`연습타석 배정`, `파3 코스 배정`, `회원권/상품 구매`, `라카 대여/연장`, `타석 이동`) 메인 허브
- **`components/MemberAuth.tsx`**: 휴대폰 뒷번호(4자리 중복 시 11자리 안내) / 전체번호 / QR·바코드 / 스마트태그(`authenticateSmartTag`) 회원 인증
- **`components/MemberRegister.tsx`**: 30초 즉석 신규 회원가입 (한글 가상키보드 `VirtualKeyboard.tsx`, 약관 동의, 안면인식 캡처 연동)
- **`components/CheckinSelect.tsx`**: 당일 예약 내역 조회 및 체크인 허용 시간(시작 60분 전 ~ 종료 전) 검증 후 즉시 체크인
- **`components/PracticeSelect.tsx` & `TeeboxMap.tsx` & `TeeboxTileCard.tsx`**: 층별 타석 맵, 점검/비활성/버퍼 타석 터치 원천 차단, 단일/그룹 배정 및 타석 이동(`POST /api/v1/kiosk/bays/move`)
- **`components/CompanionSetupModal.tsx` & `ChainedBookingModal.tsx`**: 그룹 동반자(회원권 차감 vs 일일권 결제) 설정 및 연속 예약(Chained Booking)
- **`components/Par3Allocation.tsx`**: 파3 코스/티타임 선택, 보유 이용권 차감 및 카드 결제(웹훅 실패 시 VAN 자동 망취소/DLQ 탑재)
- **`components/ProductShop.tsx`**: 일일 타석권 및 회원 전용 이용권 매대 (`RENTAL` 라카 상품 분리 및 비회원 회원권 구매 선제 차단)
- **`components/LockerExtend.tsx`**: 본인 보유 라카(`locker_id` 매핑) 기간 연장 상품 선택 및 선점(`holdLockerExtension`)
- **`components/PaymentTerminal.tsx`**: 다중 사업자 단말기 라우팅(`POST /api/v1/kiosk/terminals/resolve`, Zero Tax Distortion 강제), 면세(`vat_yn === 'N'`) 및 포인트/등급할인 정산, 바코드 쿠폰 스캔, VAN 결제 처리
- **`components/AllocationCompleteModal.tsx` & `PurchaseCompleteModal.tsx` & `ReceiptPrinter.tsx`**: 실제 매장 사업자 정보(`biz_no`, `ceo_name`) 및 카드 승인정보 기반 ESC/POS 실물 영수증/배정표 출력
- **`components/AdminPinModal.tsx` & `KioskSettingsModal.tsx`**: 관리자 PIN(5회 오입력 30초 잠금) 및 동적 매장코드(`storeCode`)/단말기(`deviceId`)/VCAT 포트 실시간 설정
