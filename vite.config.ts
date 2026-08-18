import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

import path from 'path'
import fs from 'fs'

const rootVersionPath = path.resolve(__dirname, '../VERSION')
const appVersion = fs.existsSync(rootVersionPath)
  ? fs.readFileSync(rootVersionPath, 'utf-8').trim()
  : '0.3.0'

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(`v${appVersion}`),
  },
  plugins: [react()],
  server: {
    port: 5179, // 기존 백엔드/POS 포트와 충돌을 방지하기 위해 5179로 설정
    host: true
  }
})
