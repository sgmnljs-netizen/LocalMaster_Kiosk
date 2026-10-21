import React from 'react'
import ReactDOM from 'react-dom/client'
import KioskApp from './KioskApp'
import './styles/kiosk_design_system.css'
import { generateDefault50Bays, DEFAULT_50_ZONES, api } from './services/api'

// [Demo Showcase Environment Init]
function initDemoEnvironment() {
  if (!localStorage.getItem('LM_STORE_INFO')) {
    localStorage.setItem('LM_STORE_INFO', JSON.stringify({
      store_cd: 'H01-SE-001',
      store_nm: '골포스 강남 1호점 (체험관)',
      business_no: '721-81-04039',
      ceo_name: '대표이사',
      address: '서울특별시 강남구 테헤란로 123',
    }));
  }

  if (!localStorage.getItem('LM_ZONES') || localStorage.getItem('LM_ZONES') === '[]') {
    localStorage.setItem('LM_ZONES', JSON.stringify(DEFAULT_50_ZONES));
  }

  const bays = JSON.parse(localStorage.getItem('LM_BAYS') || '[]');
  if (!bays || bays.length !== 50) {
    localStorage.setItem('LM_BAYS', JSON.stringify(generateDefault50Bays()));
  }

  if (!localStorage.getItem('LM_PRODUCTS')) {
    const products = [
      { prod_cd: 'D01', prod_nm: '일일 타석 60분', standard_price: 20000, sale_price: 20000, logic_type: 'DAILY', duration_min: 60 },
      { prod_cd: 'D02', prod_nm: '일일 타석 90분', standard_price: 28000, sale_price: 28000, logic_type: 'DAILY', duration_min: 90 },
      { prod_cd: 'D03', prod_nm: '일일 타석 120분', standard_price: 35000, sale_price: 35000, logic_type: 'DAILY', duration_min: 120 },
      { prod_cd: 'P03', prod_nm: '1개월 정기 회원권', standard_price: 180000, sale_price: 180000, logic_type: 'MEMBERSHIP', days: 30 },
      { prod_cd: 'P04', prod_nm: '3개월 정기 회원권', standard_price: 480000, sale_price: 450000, logic_type: 'MEMBERSHIP', days: 90 },
    ];
    localStorage.setItem('LM_PRODUCTS', JSON.stringify(products));
  }

  if (!localStorage.getItem('LM_MEMBERS')) {
    const members = [
      { member_no: 'M001', member_name: '홍길동', hp: '010-1234-5678', member_grade: '정회원', status_cd: 'ACTIVE' },
      { member_no: 'M002', member_name: '이골프', hp: '010-9988-7766', member_grade: '정회원', status_cd: 'ACTIVE' },
    ];
    localStorage.setItem('LM_MEMBERS', JSON.stringify(members));
  }
}

initDemoEnvironment();

// [전역 가딩] 브라우저 기본 Zoom 단축키 무조건 방지
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '-' || e.key === '+' || e.key === '0')) {
    e.preventDefault();
  }
});

// [전역 크래시 블랙박스 가드] 미처리 런타임 예외 발생 시 직전 동선과 함께 백엔드로 즉시 보고
window.addEventListener('error', (event) => {
  const errMsg = event.message || 'Unhandled window error';
  const stack = event.error instanceof Error ? event.error.stack : `${event.filename || ''}:${event.lineno || 0}`;
  api.reportKioskErrorToServer({
    action: 'RUNTIME_CRASH',
    detail: errMsg,
    errorType: 'KIOSK_CLIENT_ERROR',
    stack,
  });
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason instanceof Error ? event.reason.message : String(event.reason || 'Unhandled Promise Rejection');
  const stack = event.reason instanceof Error ? event.reason.stack : undefined;
  api.reportKioskErrorToServer({
    action: 'RUNTIME_CRASH',
    detail: `Promise Rejection: ${reason}`,
    errorType: 'KIOSK_CLIENT_ERROR',
    stack,
  });
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <KioskApp />
  </React.StrictMode>,
);
