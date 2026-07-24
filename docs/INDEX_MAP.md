# 🗺️ LocalMaster Kiosk 단일 진실 공급원(SSOT) 맵

본 문서는 **LocalMaster Kiosk 시스템의 디렉토리 아키텍처 및 핵심 명세서 내비게이션 문서**입니다.
AI 및 모든 개발자는 작업 시작 전 본 문서를 필독하여 아키텍처 규칙 및 디자인 시스템을 이탈하지 않아야 합니다.

---

## 📚 핵심 시스템 마스터 명세서 (SSOT Documents)

| 문서명 | 위치 | 설명 |
| :--- | :--- | :--- |
| 🍏 **키오스크 표준 디자인 규약** | `docs/kiosk_design_system_master.md` | 애플 미니멀 럭셔리 스타일 (White/Charcoal, Pill Button, 5% Indicator) 전역 규약 |

---

## 🎨 키오스크 화면 컴포넌트 라우팅 맵

- **`IntroScreen.tsx`**: 메인 대기 화면 (실시간 층별 타석 현황 럭셔리 위젯 표출)
- **`PracticeSelect.tsx`**: 타석 배정 방식 선택 모달 (애플 미니멀 화이트/차콜 카드)
- **`ProductShop.tsx`**: 일일 타석권/회원권 선택 화면 (애플 스토어 48px 대형 숫자 & 필 결제 버튼)
- **`AllocationCompleteModal.tsx`**: 결제 및 회원권 배정 완료 5초 카운트다운 배정표 티켓 팝업
- **`PaymentTerminal.tsx`**: 가상 결제 단말기 인터페이스
