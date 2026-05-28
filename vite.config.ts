import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5179, // 기존 백엔드/POS 포트와 충돌을 방지하기 위해 5179로 설정
    host: true
  }
})
