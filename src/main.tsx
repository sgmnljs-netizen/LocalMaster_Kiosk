import React from 'react'
import ReactDOM from 'react-dom/client'
import KioskApp from './KioskApp'
import './styles/kiosk_design_system.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <KioskApp />
  </React.StrictMode>,
)
