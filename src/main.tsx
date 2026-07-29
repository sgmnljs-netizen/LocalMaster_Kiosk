import React from 'react'
import ReactDOM from 'react-dom/client'
import KioskApp from './KioskApp'
import './styles/kiosk_design_system.css'

// [전역 가딩] 브라우저 기본 Zoom 단축키(Ctrl + / - / 0 / Ctrl+Wheel) 무조건 방지
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '-' || e.key === '+' || e.key === '0')) {
    e.preventDefault();
  }
  // 운영(PROD) 환경 전용: F5 및 Ctrl+R 새로고침 차단
  if (import.meta.env.PROD) {
    if (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r')) {
      e.preventDefault();
    }
  }
});

window.addEventListener('wheel', (e) => {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
  }
}, { passive: false });

// 운영(PROD) 환경 전용: 우클릭 콘텍스트 메뉴 방지 (개발자 모드에서는 검사 가능하도록 허용)
if (import.meta.env.PROD) {
  window.addEventListener('contextmenu', (e) => e.preventDefault());
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <KioskApp />
  </React.StrictMode>,
)



