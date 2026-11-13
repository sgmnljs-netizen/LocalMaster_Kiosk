# 🛡️ LocalMaster_Kiosk 개발 지침 (Self-Service Kiosk UI Rules)

이 문서는 AI 에이전트가 `LocalMaster_Kiosk` 리포지토리(`Port 5179`)에서 무인 타석 배정 키오스크 작업을 수행할 때 반드시 준수해야 하는 최우선 규칙입니다.
작업 시작 전 반드시 [docs/INDEX_MAP.md](file:///Users/sgmnljs/workspace/Python/LocalMaster_Kiosk/docs/INDEX_MAP.md) 및 하위 6대 키오스크 도메인 마스터 문서를 먼저 읽으십시오.

## 1. 실측 기술 스택 및 포트 락다운
- **Port:** **`Port 5179` 고정** — Admin(`5175`), POS(`5174`) 포트 침범 금지
- **Framework & Shell:** **React 18.3 + Vite 5 + TypeScript** + **Electron 44 무인 풀스크린 앱 쉘**
- **Target Display:** **27인치 FHD 세로형(`1080 × 1920`) 무인 터치스크린** 최적화 (원거리 가독성·대형 터치 타겟·자동 대기화면 복귀 타이머 필수)
- **Hardware & VAN:** 로컬 브릿지 데몬(`Port 18080`, 내장 시리얼 영수증 프린터·바코드/QR 스캐너·CAT 카드단말기) 연동

## 2. 절대 금지 및 무인 운영 방어 가드레일
- **Zero-Hardcode 빌드 게이트 엄수:** `npm run build` 내부에 `npm run audit:hardcode`가 강제 결합되어 있습니다. 매장명, 포트, 상태값, 요금, 문구 매직 밸류를 코드에 하드코딩하면 빌드가 즉시 실패하므로 반드시 백엔드 SSOT 및 환경설정에서 동적 주입하십시오.
- **무인 결제 2PC & 자동 망취소(Auto-Cancel) 무결성:** 카드 승인 성공 후 백엔드 타석 배정/이용권 발권 API가 실패하거나 타임아웃될 경우, 고아 결제가 남지 않도록 **즉시 자동 망취소 및 DLQ(Dead-Letter Queue) 복구 로그 기록** 흐름을 절대 훼손하지 마십시오.
- **무인 세션 개인정보 보호:** 타임아웃·완료·취소 시 회원 인증 토큰, 입력 중인 전화번호/PIN, 장바구니 상태를 100% 즉시 초기화하십시오.
- **Orval / Strict Type 준수:** `as any` 타입 우회 및 에러 삼키기(Error Swallowing)를 금지하고, 현장 고객이 이해할 수 있는 명확한 안내 모달과 카운터 문의 가이드를 표시하십시오.

## 3. 표준 실행 및 검증 명령어
- **개발 서버 구동:** `npm run dev` (`.env` 기반, `Port 5179`)
- **하드코딩 감사 및 프로덕션 빌드:** `npm run audit:hardcode && npm run build`
- **단위 / 골든 회귀 테스트:** `npm run test:unit` (Vitest) / `npm run test:golden` (Playwright)
