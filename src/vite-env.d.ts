/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_STORE_CODE?: string;
  readonly VITE_KIOSK_WS_KEY?: string;
  readonly VITE_MIDDLEWARE_API_KEY?: string;
  readonly VITE_MIDDLEWARE_URL?: string;
  readonly VITE_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __APP_VERSION__: string;


