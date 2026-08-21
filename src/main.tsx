import React from 'react'
import ReactDOM from 'react-dom/client'
import KioskApp from './KioskApp'
import './styles/kiosk_design_system.css'

// [Demo Showcase Environment Init]
function initDemoEnvironment() {
  if (!localStorage.getItem('LM_STORE_INFO')) {
    localStorage.setItem('LM_STORE_INFO', JSON.stringify({
      store_cd: 'H01-SE-001',
      store_nm: '로컬마스터 강남 1호점 (체험관)',
      business_no: '123-45-67890',
      ceo_name: '홍길동',
      address: '서울특별시 강남구 테헤란로 123',
    }));
  }

  if (!localStorage.getItem('LM_BAYS')) {
    const bays = Array.from({ length: 12 }, (_, i) => ({
      bay_id: i + 1,
      bay_no: i + 1,
      floor_no: 1,
      floor: '1F',
      zone_code: 'BAY',
      type: i === 1 ? 'LEFT' : 'RIGHT',
      status: i === 1 || i === 4 || i === 7 ? 'OCCUPIED' : 'AVAILABLE',
      current_user_name: i === 1 ? '김프로' : i === 4 ? '이회원' : i === 7 ? '박골퍼' : null,
      minutes_left: i === 1 ? 45 : i === 4 ? 12 : i === 7 ? 30 : 0,
      bay_name: `${i + 1}번 타석 ${i === 1 ? '(좌타겸용)' : i === 2 ? '(프라이빗)' : '(오픈형)'}`,
    }));
    localStorage.setItem('LM_BAYS', JSON.stringify(bays));
  }

  if (!localStorage.getItem('LM_PRODUCTS')) {
    const products = [
      { prod_cd: 'P01', prod_nm: '일일 타석 60분', standard_price: 20000, sale_price: 20000, logic_type: 'FACILITY', duration_min: 60 },
      { prod_cd: 'P02', prod_nm: '일일 타석 90분', standard_price: 28000, sale_price: 28000, logic_type: 'FACILITY', duration_min: 90 },
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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <KioskApp />
  </React.StrictMode>,
);
